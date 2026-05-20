import { type Finding, FindingStatus, type LedgerBackend, type LedgerSnapshot } from '@maat-tools/contracts';
import type { KernelProgressEvent } from '@maat-tools/kernel';
import type { Printer } from '../printer';
import { createSpinner } from '../spinner';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type CheckOptions = {
	ledger?: boolean;
	showBaselined?: boolean;
	show?: string;
	silent?: boolean;
};

type CheckDisplayMode = 'all' | 'findings' | 'insights';

const CHECK_DISPLAY_MODES = new Set<CheckDisplayMode>(['all', 'findings', 'insights']);

type LedgerAnalysis = {
	baselinedFingerprints: Set<string>;
	axiomExceptedFingerprints: Set<string>;
	activeAxiomCount: number;
	hasRegressions: boolean;
	hasExpiredBaselines: boolean;
};

export class Check extends MaatCommandBase implements MaatCommand {
	public async action(options: CheckOptions = {}) {
		const printer = options.silent ? this.printer.asSilent() : this.printer;
		const displayMode = this.resolveDisplayMode(options.show, printer);

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
		const { findings: currentFindings } = await this.kernel
			.run({
				onProgress: (event: KernelProgressEvent) => {
					if (event.type === 'collector:start') {
						spinner?.update(`Collecting ${event.collectorId} (${event.index + 1}/${event.total})`);
					}
					if (event.type === 'enricher:start') {
						spinner?.update(`Enriching ${event.enricherId} (${event.index + 1}/${event.total})`);
					}
				},
			})
			.finally(() => spinner?.stop());
		const currentFingerprints = new Set(currentFindings.map((f) => f.fingerprint));

		const actionableFindings = currentFindings.filter((f) => !f.requiresVerification);

		if (!this.isLedgerProvided()) {
			if (displayMode === 'all') {
				this.printRunContext(printer, { ledger: false });
			}
			if (displayMode === 'all' || displayMode === 'findings') {
				printer.findings(currentFindings, (id) => this.kernel.getRuleById(id));
			}
			if (displayMode === 'all' || displayMode === 'insights') {
				await this.printInsights(currentFindings, printer, { warnAboutScope: displayMode === 'all' });
			}
			if (this.config.check?.strict && actionableFindings.length > 0) {
				process.exit(1);
			}
			return;
		}

		const snapshot = await this.ledger.getState();
		const analysis = this.analyzeLedgerState(snapshot, currentFingerprints);

		const currentFindingsWithVerification = this.clearVerificationForApprovedFindings(currentFindings, snapshot);

		if (options.ledger === true) {
			await this.syncLedgerEvents(
				this.ledger,
				snapshot.findings,
				currentFindingsWithVerification,
				currentFingerprints,
				analysis,
			);
		}

		const visibleFindings = options.showBaselined
			? currentFindingsWithVerification
			: this.getActiveFindings(
					currentFindingsWithVerification,
					analysis.baselinedFingerprints,
					analysis.axiomExceptedFingerprints,
				);

		if (displayMode === 'all') {
			this.printRunContext(printer, {
				ledger: true,
				writesLedger: options.ledger === true,
				showBaselined: options.showBaselined === true,
			});
		}
		if (displayMode === 'all' || displayMode === 'findings') {
			printer.findings(visibleFindings, (id) => this.kernel.getRuleById(id));
		}
		if (displayMode === 'all' || displayMode === 'insights') {
			await this.printInsights(currentFindingsWithVerification, printer, { warnAboutScope: displayMode === 'all' });
		}
		this.evaluateExitConditions(visibleFindings, analysis, printer, { printSummary: displayMode !== 'insights' });
	}

	public register(): void {
		this.cli
			.command('check')
			.description('Scan the codebase for architectural findings')
			.option('--ledger', 'Save findings to the ledger')
			.option('--show-baselined', 'Include baselined findings in output and exit code evaluation')
			.option('--show <mode>', 'Choose output sections to show: all, findings, insights', 'all')
			.option('--silent', 'Suppress all console output (exit code still reflects findings)')
			.action((options: CheckOptions) => this.action(options));
	}

	private resolveDisplayMode(show: string | undefined, printer: Printer): CheckDisplayMode {
		const mode = show ?? 'all';
		if (CHECK_DISPLAY_MODES.has(mode as CheckDisplayMode)) {
			return mode as CheckDisplayMode;
		}

		printer.error(`Invalid --show value "${mode}". Expected one of: all, findings, insights.`);
		process.exit(1);
	}

	private analyzeLedgerState(snapshot: LedgerSnapshot, currentFingerprints: Set<string>): LedgerAnalysis {
		const baselinedFingerprints = new Set<string>();
		const axiomExceptedFingerprints = new Set<string>();
		let hasRegressions = false;
		let hasExpiredBaselines = false;
		let activeAxiomCount = 0;
		const now = Date.now();

		for (const axiom of Object.values(snapshot.axioms)) {
			if (axiom.active) {
				activeAxiomCount++;
				if (axiom.fingerprints) {
					for (const fp of axiom.fingerprints) {
						axiomExceptedFingerprints.add(fp);
					}
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
			activeAxiomCount,
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
			if (finding.requiresVerification) {
				continue;
			}
			if (findingsSnapshot[finding.fingerprint] !== undefined) {
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

	private printRunContext(
		printer: Printer,
		context:
			| { ledger: false }
			| {
					ledger: true;
					writesLedger: boolean;
					showBaselined: boolean;
			  },
	): void {
		const findingsScope =
			context.ledger && !context.showBaselined
				? 'active current findings; non-expired baselines and active axiom exceptions are hidden'
				: 'all current findings from this run';
		let ledgerScope = 'not configured; no baseline, axiom, or regression filtering is applied';
		if (context.ledger) {
			ledgerScope = context.writesLedger
				? 'configured; this run reads state and writes observed/resolved events'
				: 'configured; this run reads state only';
		}

		printer.runContext([
			'Rules run on current workspace facts collected during this check.',
			`Ledger: ${ledgerScope}.`,
			`Findings shown: ${findingsScope}.`,
			'Insights run on requested rule findings from all current findings, including findings hidden by baselines or active axiom exceptions.',
		]);
	}

	private async printInsights(
		findings: Finding[],
		printer: Printer,
		options: { warnAboutScope: boolean },
	): Promise<void> {
		if (options.warnAboutScope && this.insights.length > 0) {
			printer.warn(
				'Insights analyze requested rule findings from all current findings, including findings hidden by baselines or active axiom exceptions. Insights are read-only and do not affect the check exit code.',
			);
		}

		const results = await this.runInsightsIfEnabled(findings);
		if (results.length === 0) {
			return;
		}
		printer.section(`INSIGHTS (${results.length})`);
		for (const result of results) {
			printer.insight(result);
		}
	}

	private evaluateExitConditions(
		visibleFindings: Finding[],
		analysis: LedgerAnalysis,
		printer: Printer,
		options: { printSummary: boolean },
	): void {
		const { hasRegressions, hasExpiredBaselines, activeAxiomCount } = analysis;

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

		const actionableFindings = visibleFindings.filter((f) => !f.requiresVerification);

		if (this.config.check?.strict && actionableFindings.length > 0) {
			printer.error(
				'One or more findings detected. Please address these issues to comply with the defined architecture.',
			);
			process.exit(1);
		}

		if (!options.printSummary) {
			return;
		}

		if (visibleFindings.length === 0) {
			const summary =
				activeAxiomCount > 0
					? `No findings detected (${activeAxiomCount} active axiom(s)). Great job!`
					: 'No findings detected. Great job!';
			printer.log(summary);
		} else {
			const summary =
				activeAxiomCount > 0
					? `${visibleFindings.length} finding(s) detected, ${activeAxiomCount} active axiom(s). Please review the output above for details.`
					: `${visibleFindings.length} finding(s) detected. Please review the output above for details.`;
			printer.log(summary);
		}
	}

	private clearVerificationForApprovedFindings(findings: Finding[], snapshot: LedgerSnapshot): Finding[] {
		return findings.map((finding) => {
			const record = snapshot.findings[finding.fingerprint];
			if (!finding.requiresVerification || !record?.verified) {
				return finding;
			}

			return {
				...finding,
				requiresVerification: false,
				artifacts: finding.artifacts.filter((a) => a.kind !== 'finding.provenance'),
			};
		});
	}

	private getActiveFindings(
		findings: Finding[],
		baselinedFingerprints: Set<string>,
		axiomExcepted: Set<string> = new Set(),
	): Finding[] {
		return findings.filter((f) => !baselinedFingerprints.has(f.fingerprint) && !axiomExcepted.has(f.fingerprint));
	}
}
