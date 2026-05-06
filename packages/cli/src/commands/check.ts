import { type Finding, FindingStatus, type LedgerBackend, type LedgerSnapshot } from '@maat/contracts';
import type { Printer } from '../printer';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type CheckOptions = {
	ledger?: boolean;
	showBaselined?: boolean;
	silent?: boolean;
};

type LedgerAnalysis = {
	baselinedFingerprints: Set<string>;
	enforcedFingerprints: Set<string>;
	axiomExceptedFingerprints: Set<string>;
	hasRegressions: boolean;
	hasPendingResolutions: boolean;
};

export class Check extends MaatCommandBase implements MaatCommand {
	public async action(options: CheckOptions = {}) {
		const printer = options.silent ? this.printer.asSilent() : this.printer;

		if (options.ledger === true && !this.isLedgerProvided()) {
			printer.error(
				'Ledger option enabled, but no ledger configured. Please configure a ledger in your maat.config.ts to use this feature.',
			);
			process.exit(1);
		}

		if (options.showBaselined && !this.isLedgerProvided()) {
			printer.error('--show-baselined requires a ledger to be configured.');
			process.exit(1);
		}

		const { findings: currentFindings } = await this.kernel.run();
		const currentFingerprints = new Set(currentFindings.map((f) => f.fingerprint));

		if (!this.isLedgerProvided()) {
			printer.findings(currentFindings, (id) => this.kernel.getRuleById(id));
			this.printInsights(currentFindings, printer);
			if (this.config.check?.strict && currentFindings.length > 0) {
				process.exit(1);
			}
			return;
		}

		const snapshot = await this.ledger.getState();
		const analysis = this.analyzeLedgerState(snapshot, currentFingerprints);

		if (options.ledger === true) {
			await this.syncLedgerEvents(
				this.ledger,
				snapshot.findings,
				currentFindings,
				currentFingerprints,
				analysis,
				printer,
			);
		}

		const visibleFindings = options.showBaselined
			? currentFindings
			: this.getActiveFindings(currentFindings, analysis.baselinedFingerprints, analysis.axiomExceptedFingerprints);

		printer.findings(visibleFindings, (id) => this.kernel.getRuleById(id));
		this.printInsights(visibleFindings, printer);
		this.evaluateExitConditions(visibleFindings, analysis, printer);
	}

	public register(): void {
		this.cli
			.command('check')
			.description('Scan the codebase for architectural findings')
			.option('--ledger', 'Save findings to the ledger')
			.option('--show-baselined', 'Include baselined findings in output and exit code evaluation')
			.option('--silent', 'Suppress all console output (exit code still reflects findings)')
			.action((options: CheckOptions) => this.action(options));
	}

	private analyzeLedgerState(snapshot: LedgerSnapshot, currentFingerprints: Set<string>): LedgerAnalysis {
		const baselinedFingerprints = new Set<string>();
		const enforcedFingerprints = new Set<string>();
		const axiomExceptedFingerprints = new Set<string>();
		let hasRegressions = false;
		let hasPendingResolutions = false;

		for (const axiom of Object.values(snapshot.axioms)) {
			if (axiom.active && axiom.fingerprints) {
				for (const fp of axiom.fingerprints) {
					axiomExceptedFingerprints.add(fp);
				}
			}
		}

		for (const record of Object.values(snapshot.findings)) {
			if (record.baselined) {
				baselinedFingerprints.add(record.fingerprint);
			}
			if (record.state === FindingStatus.ENFORCED) {
				enforcedFingerprints.add(record.fingerprint);
			}
			if (record.state === FindingStatus.RESOLVED && currentFingerprints.has(record.fingerprint)) {
				hasRegressions = true;
			}
			if (
				(record.state === FindingStatus.PROMOTED || record.state === FindingStatus.ENFORCED) &&
				!currentFingerprints.has(record.fingerprint)
			) {
				hasPendingResolutions = true;
			}
		}

		return {
			baselinedFingerprints,
			enforcedFingerprints,
			axiomExceptedFingerprints,
			hasRegressions,
			hasPendingResolutions,
		};
	}

	private async syncLedgerEvents(
		ledger: LedgerBackend,
		findingsSnapshot: LedgerSnapshot['findings'],
		currentFindings: Finding[],
		currentFingerprints: Set<string>,
		analysis: LedgerAnalysis,
		printer: Printer,
	): Promise<void> {
		const timestamp = new Date().toISOString();

		for (const record of Object.values(findingsSnapshot)) {
			if (currentFingerprints.has(record.fingerprint)) {
				continue;
			}
			if (record.state === FindingStatus.OBSERVED && !record.baselined) {
				await ledger.append({
					type: FindingStatus.RESOLVED,
					timestamp,
					fingerprint: record.fingerprint,
				});
			} else if (record.state === FindingStatus.PROMOTED || record.state === FindingStatus.ENFORCED) {
				printer.warn(
					`[maat] Finding "${record.fingerprint}" (${record.state}) is no longer detected. Run 'maat resolve --fingerprint ${record.fingerprint}' to confirm resolution.`,
				);
			}
		}

		for (const finding of this.getActiveFindings(
			currentFindings,
			analysis.baselinedFingerprints,
			analysis.axiomExceptedFingerprints,
		)) {
			await ledger.append({
				type: FindingStatus.OBSERVED,
				timestamp,
				fingerprint: finding.fingerprint,
				rule_id: finding.ruleId,
				message: finding.message,
				artifacts: finding.artifacts,
			});
		}
	}

	private printInsights(findings: Finding[], printer: Printer): void {
		for (const result of this.runInsightsIfEnabled(findings)) {
			printer.insight(result);
		}
	}

	private evaluateExitConditions(visibleFindings: Finding[], analysis: LedgerAnalysis, printer: Printer): void {
		const { enforcedFingerprints, hasRegressions, hasPendingResolutions } = analysis;
		const hasEnforcedViolations = visibleFindings.some((f) => enforcedFingerprints.has(f.fingerprint));

		if (hasEnforcedViolations || hasRegressions || hasPendingResolutions) {
			if (hasEnforcedViolations) {
				printer.error(
					'One or more findings are currently enforced. Please address these issues to comply with the defined architecture.',
				);
			}
			if (hasRegressions) {
				printer.error(
					'One or more findings have reappeared after being marked as resolved. Please investigate these regressions.',
				);
			}
			if (hasPendingResolutions) {
				printer.error(
					'One or more findings that were previously promoted or enforced are no longer detected. Please confirm their resolution.',
				);
			}
			process.exit(1);
		}

		if (this.config.check?.strict && visibleFindings.length > 0) {
			printer.error(
				'One or more findings detected. Please address these issues to comply with the defined architecture.',
			);
			process.exit(1);
		}

		if (visibleFindings.length === 0) {
			printer.log('No findings detected. Great job!');
		} else {
			printer.log(`${visibleFindings.length} finding(s) detected. Please review the output above for details.`);
		}
	}

	private getActiveFindings(
		findings: Finding[],
		baselinedFingerprints: Set<string>,
		axiomExcepted: Set<string> = new Set(),
	): Finding[] {
		return findings.filter((f) => !baselinedFingerprints.has(f.fingerprint) && !axiomExcepted.has(f.fingerprint));
	}
}
