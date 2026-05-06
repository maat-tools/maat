import {
	type Artifact,
	type Finding,
	FindingStatus,
	type Rule,
} from '@maat/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

function formatArtifact(artifact: Artifact, rule: Rule | undefined): string {
	const described = rule?.describeArtifact(artifact) ?? {
		[artifact.kind]: String(artifact.data),
	};
	return Object.entries(described)
		.map(([k, v]) => `${k}: ${v}`)
		.join('  ');
}

function printFindings(
	findings: Finding[],
	log: (...args: unknown[]) => void,
	getRule: (id: string) => Rule | undefined,
): void {
	if (findings.length === 0) {
		return;
	}

	const byRule = new Map<string, Finding[]>();
	for (const f of findings) {
		const group = byRule.get(f.ruleId) ?? [];
		group.push(f);
		byRule.set(f.ruleId, group);
	}

	const heading = `FINDINGS (${findings.length})`;
	log(`
${heading}`);
	log('─'.repeat(heading.length));

	for (const [ruleId, group] of byRule) {
		const rule = getRule(ruleId);
		log(`
  [${ruleId}] — ${group.length} finding(s)`);
		for (const f of group) {
			log(`    ${f.fingerprint.slice(0, 8)}  ${f.message}`);
			for (const artifact of f.artifacts) {
				log(`            ↳ ${formatArtifact(artifact, rule)}`);
			}
		}
	}
}

type CheckOptions = {
	ledger?: boolean;
	showBaselined?: boolean;
	silent?: boolean;
};

const _origLog = console.log;
console.log = (...args: unknown[]) =>
	_origLog(
		...args.map((a) =>
			typeof a === 'object' && a !== null
				? Bun.inspect(a, { depth: undefined })
				: a,
		),
	);

export class Check extends MaatCommandBase implements MaatCommand {
	public async action(options: CheckOptions = {}) {
		const log = (...args: unknown[]) => {
			if (!options.silent) {
				console.log(...args);
			}
		};
		const warn = (...args: unknown[]) => {
			if (!options.silent) {
				console.warn(...args);
			}
		};
		const error = (...args: unknown[]) => {
			if (!options.silent) {
				console.error(...args);
			}
		};

		if (options.ledger === true && !this.isLedgerProvided()) {
			error(
				'Ledger option enabled, but no ledger configured. Please configure a ledger in your maat.config.ts to use this feature.',
			);
			process.exit(1);
		}

		if (options.showBaselined && !this.isLedgerProvided()) {
			error('--show-baselined requires a ledger to be configured.');
			process.exit(1);
		}

		const { findings: currentFindings } = await this.kernel.run();
		const currentFingerprints = new Set(
			currentFindings.map((f) => f.fingerprint),
		);

		if (!this.isLedgerProvided()) {
			printFindings(currentFindings, log, (id) => this.kernel.getRuleById(id));
			const insightResults = this.runInsightsIfEnabled(currentFindings);
			for (const result of insightResults) {
				log(`[Insight: ${result.insightId}] ${result.message}`, result.data);
			}
			if (this.config.check?.strict && currentFindings.length > 0) {
				process.exit(1);
			}
			return;
		}

		const fullSnapshot = await this.ledger.getState();
		const findingsSnapshot = fullSnapshot.findings;
		const baselinedFingerprints = new Set<string>();
		const enforcedFingerprints = new Set<string>();
		const axiomExceptedFingerprints = new Set<string>();

		for (const axiom of Object.values(fullSnapshot.axioms)) {
			if (axiom.active && axiom.fingerprints) {
				for (const fp of axiom.fingerprints) {
					axiomExceptedFingerprints.add(fp);
				}
			}
		}
		let hasRegressions = false;
		let hasPendingResolutions = false;

		for (const record of Object.values(findingsSnapshot)) {
			if (record.baselined) {
				baselinedFingerprints.add(record.fingerprint);
			}
			if (record.state === FindingStatus.ENFORCED) {
				enforcedFingerprints.add(record.fingerprint);
			}
			if (
				record.state === FindingStatus.RESOLVED &&
				currentFingerprints.has(record.fingerprint)
			) {
				hasRegressions = true;
			}
			if (
				(record.state === FindingStatus.PROMOTED ||
					record.state === FindingStatus.ENFORCED) &&
				!currentFingerprints.has(record.fingerprint)
			) {
				hasPendingResolutions = true;
			}
		}

		if (options.ledger === true) {
			const timestamp = new Date().toISOString();

			for (const record of Object.values(findingsSnapshot)) {
				if (currentFingerprints.has(record.fingerprint)) {
					continue;
				}

				if (record.state === FindingStatus.OBSERVED && !record.baselined) {
					await this.ledger.append({
						type: FindingStatus.RESOLVED,
						timestamp,
						fingerprint: record.fingerprint,
					});
				} else if (
					record.state === FindingStatus.PROMOTED ||
					record.state === FindingStatus.ENFORCED
				) {
					warn(
						`[maat] Finding "${record.fingerprint}" (${record.state}) is no longer detected. Run 'maat resolve --fingerprint ${record.fingerprint}' to confirm resolution.`,
					);
				}
			}

			for (const finding of this.getActiveFindings(
				currentFindings,
				baselinedFingerprints,
				axiomExceptedFingerprints,
			)) {
				await this.ledger.append({
					type: FindingStatus.OBSERVED,
					timestamp,
					fingerprint: finding.fingerprint,
					rule_id: finding.ruleId,
					message: finding.message,
					artifacts: finding.artifacts,
				});
			}
		}

		const visibleFindings = options.showBaselined
			? currentFindings
			: this.getActiveFindings(
					currentFindings,
					baselinedFingerprints,
					axiomExceptedFingerprints,
				);

		printFindings(visibleFindings, log, (id) => this.kernel.getRuleById(id));

		const insightResults = this.runInsightsIfEnabled(visibleFindings);
		for (const result of insightResults) {
			log(`[Insight: ${result.insightId}] ${result.message}`, result.data);
		}

		const hasEnforcedViolations = visibleFindings.some((f) =>
			enforcedFingerprints.has(f.fingerprint),
		);

		if (hasEnforcedViolations || hasRegressions || hasPendingResolutions) {
			if (hasEnforcedViolations) {
				error(
					'One or more findings are currently enforced. Please address these issues to comply with the defined architecture.',
				);
			}
			if (hasRegressions) {
				error(
					'One or more findings have reappeared after being marked as resolved. Please investigate these regressions.',
				);
			}
			if (hasPendingResolutions) {
				error(
					'One or more findings that were previously promoted or enforced are no longer detected. Please confirm their resolution.',
				);
			}
			process.exit(1);
		}

		if (this.config.check?.strict && visibleFindings.length > 0) {
			error(
				'One or more findings detected. Please address these issues to comply with the defined architecture.',
			);
			process.exit(1);
		}

		if (visibleFindings.length === 0) {
			log('No findings detected. Great job!');
		} else {
			log(
				`${visibleFindings.length} finding(s) detected. Please review the output above for details.`,
			);
			if (this.config.check?.strict) {
				process.exit(1);
			}
		}
	}

	public register(): void {
		this.cli
			.command('check')
			.description('Scan the codebase for architectural findings')
			.option('--ledger', 'Save findings to the ledger')
			.option(
				'--show-baselined',
				'Include baselined findings in output and exit code evaluation',
			)
			.option(
				'--silent',
				'Suppress all console output (exit code still reflects findings)',
			)
			.action((options: CheckOptions) => this.action(options));
	}

	private getActiveFindings(
		findings: Finding[],
		baselinedFingerprints: Set<string>,
		axiomExcepted: Set<string> = new Set(),
	): Finding[] {
		return findings.filter(
			(f) =>
				!baselinedFingerprints.has(f.fingerprint) &&
				!axiomExcepted.has(f.fingerprint),
		);
	}
}
