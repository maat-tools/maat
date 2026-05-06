import { FindingStatus, type Finding } from '@maat/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type CheckOptions = {
	ledger?: boolean;
	showBaselined?: boolean;
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
		if (options.ledger === true && !this.isLedgerProvided()) {
			console.error('Ledger option enabled, but no ledger configured. Please configure a ledger in your maat.config.ts to use this feature.');
			process.exit(1);
		}

		if (options.showBaselined && !this.isLedgerProvided()) {
			console.error('--show-baselined requires a ledger to be configured.');
			process.exit(1);
		}

		const { findings: currentFindings } = await this.kernel.run();
		const currentFingerprints = new Set(currentFindings.map((f) => f.fingerprint));

		if (!this.isLedgerProvided()) {
			const insightResults = this.runInsightsIfEnabled(currentFindings);
			for (const result of insightResults) {
				console.log(`[Insight: ${result.insightId}] ${result.message}`, result.data);
			}
			if (this.config.check?.strict && currentFindings.length > 0) {
				process.exit(1);
			}
			return;
		}

		const snapshot = (await this.ledger.getState()).findings;
		const baselinedFingerprints = new Set<string>();
		const enforcedFingerprints = new Set<string>();
		let hasRegressions = false;
		let hasPendingResolutions = false;

		for (const record of Object.values(snapshot)) {
			if (record.baselined) {
				baselinedFingerprints.add(record.fingerprint);
			}
			if (record.state === FindingStatus.ENFORCED) {
				enforcedFingerprints.add(record.fingerprint);
			}
			if (record.state === FindingStatus.RESOLVED && currentFingerprints.has(record.fingerprint)) {
				hasRegressions = true;
			}
			if ((record.state === FindingStatus.PROMOTED || record.state === FindingStatus.ENFORCED) && !currentFingerprints.has(record.fingerprint)) {
				hasPendingResolutions = true;
			}
		}

		if (options.ledger === true) {
			const timestamp = new Date().toISOString();

			for (const record of Object.values(snapshot)) {
				if (currentFingerprints.has(record.fingerprint)) {
					continue;
				}

				if (record.state === FindingStatus.OBSERVED && !record.baselined) {
					await this.ledger.append({ type: FindingStatus.RESOLVED, timestamp, fingerprint: record.fingerprint });
				} else if (record.state === FindingStatus.PROMOTED || record.state === FindingStatus.ENFORCED) {
					console.warn(`[maat] Finding "${record.fingerprint}" (${record.state}) is no longer detected. Run 'maat resolve --fingerprint ${record.fingerprint}' to confirm resolution.`);
				}
			}

			for (const finding of this.getActiveFindings(currentFindings, baselinedFingerprints)) {
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
			: this.getActiveFindings(currentFindings, baselinedFingerprints);

		const insightResults = this.runInsightsIfEnabled(visibleFindings);
		for (const result of insightResults) {
			console.log(`[Insight: ${result.insightId}] ${result.message}`, result.data);
		}

		const hasEnforcedViolations = visibleFindings.some((f) => enforcedFingerprints.has(f.fingerprint));

		if (hasEnforcedViolations || hasRegressions || hasPendingResolutions) {
			process.exit(1);
		}

		if (this.config.check?.strict && visibleFindings.length > 0) {
			process.exit(1);
		}
	}

	public register(): void {
		this.cli
			.command('check')
			.description('Scan the codebase for architectural findings')
			.option('--ledger', 'Save findings to the ledger')
			.option('--show-baselined', 'Include baselined findings in output and exit code evaluation')
			.action((options: CheckOptions) => this.action(options));
	}

	private getActiveFindings(findings: Finding[], baselinedFingerprints: Set<string>): Finding[] {
		return findings.filter((f) => !baselinedFingerprints.has(f.fingerprint));
	}
}
