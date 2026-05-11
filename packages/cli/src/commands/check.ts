import { type Finding, FindingStatus, type LedgerBackend, type LedgerSnapshot } from '@maat-tools/contracts';
import type { KernelProgressEvent } from '@maat-tools/kernel';
import type { Printer } from '../printer';
import { createSpinner } from '../spinner';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type CheckOptions = {
	ledger?: boolean;
	showBaselined?: boolean;
	silent?: boolean;
};

type LedgerAnalysis = {
	baselinedFingerprints: Set<string>;
	axiomExceptedFingerprints: Set<string>;
	hasRegressions: boolean;
	hasExpiredBaselines: boolean;
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

		const spinner = options.silent ? null : createSpinner();
		const { findings: currentFindings } = await this.kernel.run({
			onProgress: (event: KernelProgressEvent) => {
				if (event.type === 'collector:start') {
					spinner?.update(`Collecting ${event.collectorId} (${event.index + 1}/${event.total})`);
				}
			},
		});
		spinner?.stop();
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
			await this.syncLedgerEvents(this.ledger, snapshot.findings, currentFindings, currentFingerprints, analysis);
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
		const axiomExceptedFingerprints = new Set<string>();
		let hasRegressions = false;
		let hasExpiredBaselines = false;
		const now = Date.now();

		for (const axiom of Object.values(snapshot.axioms)) {
			if (axiom.active && axiom.fingerprints) {
				for (const fp of axiom.fingerprints) {
					axiomExceptedFingerprints.add(fp);
				}
			}
		}

		for (const record of Object.values(snapshot.findings)) {
			if (record.baselined) {
				const expired =
					record.baseline_expires_at !== undefined && new Date(record.baseline_expires_at).getTime() <= now;
				if (expired) {
					hasExpiredBaselines = true;
				} else {
					baselinedFingerprints.add(record.fingerprint);
				}
			}
			if (record.state === FindingStatus.RESOLVED && currentFingerprints.has(record.fingerprint)) {
				hasRegressions = true;
			}
		}

		return {
			baselinedFingerprints,
			axiomExceptedFingerprints,
			hasRegressions,
			hasExpiredBaselines,
		};
	}

	private async syncLedgerEvents(
		ledger: LedgerBackend,
		findingsSnapshot: LedgerSnapshot['findings'],
		currentFindings: Finding[],
		currentFingerprints: Set<string>,
		analysis: LedgerAnalysis,
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
			}
		}

		for (const finding of this.getActiveFindings(
			currentFindings,
			analysis.baselinedFingerprints,
			analysis.axiomExceptedFingerprints,
		)) {
			if (findingsSnapshot[finding.fingerprint]?.state === FindingStatus.RESOLVED) {
				continue;
			}
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
		const { hasRegressions, hasExpiredBaselines } = analysis;

		if (hasRegressions || hasExpiredBaselines) {
			if (hasRegressions) {
				printer.error(
					'One or more findings have reappeared after being marked as resolved. Please investigate these regressions.',
				);
			}
			if (hasExpiredBaselines) {
				printer.error(
					"One or more baselined findings have expired. Please revisit them: resolve, re-baseline with 'maat baseline', or address the underlying issues.",
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
