import {
	type AxiomEvent,
	type Finding,
	type FindingEvent,
	FindingStatus,
	type LedgerBackend,
} from '@maat-tools/contracts';
import type { KernelProgressEvent } from '@maat-tools/kernel';
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
	requiringVerificationFingerprints: Set<string>;
	revokedFingerprints: Set<string>;
	activeAxiomCount: number;
	hasRegressions: boolean;
	hasExpiredBaselines: boolean;
};

export class Check extends MaatCommandBase implements MaatCommand {
	public async action(options: CheckOptions = {}) {
		if (options.silent) {
			this.presenter = this.presenter.asSilent();
		}
		const displayMode = this.resolveDisplayMode(options.show);

		if (options.ledger === true && !this.isLedgerProvided()) {
			this.presenter.error(
				'Ledger option enabled, but no ledger configured. Please configure a ledger in your maat.config.ts to use this feature.\n',
			);
			process.exit(1);
		}

		if (options.showBaselined && !this.isLedgerProvided()) {
			this.presenter.error('--show-baselined requires a ledger to be configured.\n');
			process.exit(1);
		}

		const spinner = options.silent ? null : createSpinner();
		const totalLLMCosts = { usedTokens: 0, cost: 0 };
		const { findings: currentFindings } = await this.kernel
			.run({
				onProgress: (event: KernelProgressEvent) => {
					if (event.type === 'collector:start') {
						spinner?.update(`Collecting ${event.collectorId} (${event.index + 1}/${event.total})`);
					}
					if (event.type === 'enricher:start') {
						spinner?.update(`Enriching ${event.enricherId} (${event.index + 1}/${event.total})`);
					}
					if (event.type === 'enricher:done') {
						if (event.enriched.usedTokens) {
							totalLLMCosts.usedTokens += event.enriched.usedTokens;
						}
						if (event.enriched.cost) {
							totalLLMCosts.cost += event.enriched.cost;
						}
					}
				},
			})
			.finally(() => spinner?.stop());

		const currentFingerprints = new Set(currentFindings.map((f) => f.fingerprint));
		const actionableFindings = currentFindings.filter((f) => !f.requiresVerification);

		if (!this.isLedgerProvided()) {
			if (displayMode === 'all') {
				this.printRunContext({ ledger: false });
			}
			if (displayMode === 'all' || displayMode === 'findings') {
				this.presenter.findings(currentFindings, (id) => this.kernel.getRuleById(id));
			}
			if (displayMode === 'all' || displayMode === 'insights') {
				await this.printInsights(currentFindings, { warnAboutScope: displayMode === 'all' });
			}
			if (totalLLMCosts.usedTokens > 0) {
				this.presenter.info(
					`\nLLM costs: $${totalLLMCosts.cost.toFixed(6)} (${totalLLMCosts.usedTokens.toLocaleString()} tokens)\n`,
				);
			}
			if (this.config.check?.strict && actionableFindings.length > 0) {
				this.presenter.error(
					'One or more findings that require verification detected. Please address these issues to comply with the defined architecture.\n',
				);
				process.exit(1);
			}
			return;
		}

		const axioms = await this.ledger.getAllAxiomsState();
		const findings = await this.ledger.getAllFindingsState();
		const analysis = await this.analyzeLedgerState(axioms, findings, currentFingerprints);
		if (options.ledger === true) {
			await this.syncLedgerEvents(this.ledger, findings, currentFindings, currentFingerprints, analysis);
		}
		const ledgerByFingerprint = new Map(findings.map((r) => [r.fingerprint, r]));
		const reconciled = currentFindings.map((f) => {
			const record = ledgerByFingerprint.get(f.fingerprint);
			if (f.requiresVerification && record?.type === FindingStatus.OBSERVED) {
				return { ...f, requiresVerification: false };
			}
			return f;
		});
		const visibleFindings = options.showBaselined ? reconciled : this.getVisibleFindings(reconciled, analysis);

		if (displayMode === 'all') {
			this.printRunContext({
				ledger: true,
				writesLedger: options.ledger === true,
				showBaselined: options.showBaselined === true,
			});
		}

		if (displayMode === 'all' || displayMode === 'findings') {
			this.presenter.findings(visibleFindings, (id) => this.kernel.getRuleById(id));
		}

		if (displayMode === 'all' || displayMode === 'insights') {
			await this.printInsights(reconciled, { warnAboutScope: displayMode === 'all' });
		}

		if (totalLLMCosts.usedTokens > 0) {
			this.presenter.info(
				`\nLLM costs: $${totalLLMCosts.cost === 0 ? '0.000000' : totalLLMCosts.cost.toFixed(6)} (${totalLLMCosts.usedTokens === 0 ? '0' : totalLLMCosts.usedTokens.toLocaleString()} tokens)\n`,
			);
		}

		this.evaluateExitConditions(visibleFindings, analysis, { printSummary: displayMode !== 'insights' });
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

	private resolveDisplayMode(show: string | undefined): CheckDisplayMode {
		const mode = show ?? 'all';
		if (CHECK_DISPLAY_MODES.has(mode as CheckDisplayMode)) {
			return mode as CheckDisplayMode;
		}

		this.presenter.error(`Invalid --show value "${mode}". Expected one of: all, findings, insights.\n`);
		process.exit(1);
	}

	private async analyzeLedgerState(
		axioms: AxiomEvent[],
		findings: FindingEvent[],
		currentFingerprints: Set<string>,
	): Promise<LedgerAnalysis> {
		const baselinedFingerprints = new Set<string>();
		const axiomExceptedFingerprints = new Set<string>();
		const requiringVerificationFingerprints = new Set<string>();
		const revokedFingerprints = new Set<string>();
		let hasRegressions = false;
		let hasExpiredBaselines = false;
		let activeAxiomCount = 0;
		const now = Date.now();

		for (const axiom of axioms) {
			if (axiom.type === FindingStatus.AXIOM_DECLARED) {
				activeAxiomCount++;
				if (axiom.fingerprints) {
					for (const fp of axiom.fingerprints) {
						axiomExceptedFingerprints.add(fp);
					}
				}
			}
		}

		for (const record of findings) {
			if (record.type === FindingStatus.BASELINED) {
				const expired = new Date(record.expiresAt).getTime() <= now;
				if (expired) {
					hasExpiredBaselines = true;
				} else {
					baselinedFingerprints.add(record.fingerprint);
				}
			}
			if (record.type === FindingStatus.RESOLVED && currentFingerprints.has(record.fingerprint)) {
				hasRegressions = true;
			}
			if (record.type === FindingStatus.UNVERIFIED && currentFingerprints.has(record.fingerprint)) {
				requiringVerificationFingerprints.add(record.fingerprint);
			}
			if (record.type === FindingStatus.REVOKED && currentFingerprints.has(record.fingerprint)) {
				revokedFingerprints.add(record.fingerprint);
			}
		}

		return {
			baselinedFingerprints,
			axiomExceptedFingerprints,
			activeAxiomCount,
			hasRegressions,
			hasExpiredBaselines,
			requiringVerificationFingerprints,
			revokedFingerprints,
		};
	}

	private async syncLedgerEvents(
		ledger: LedgerBackend,
		findings: FindingEvent[],
		currentFindings: Finding[],
		currentFingerprints: Set<string>,
		analysis: LedgerAnalysis,
	): Promise<void> {
		if (!this.isLedgerProvided()) {
			throw new Error('Ledger is not configured');
		}
		const timestamp = new Date().toISOString();
		const findingsByFingerprint = new Map(findings.map((r) => [r.fingerprint, r]));

		for (const record of findings) {
			if (currentFingerprints.has(record.fingerprint)) {
				continue;
			}
			if (record.type === FindingStatus.OBSERVED) {
				await ledger.append({
					type: FindingStatus.RESOLVED,
					timestamp,
					fingerprint: record.fingerprint,
					ruleId: record.ruleId,
					instanceId: record.instanceId,
					message: record.message,
					artifacts: record.artifacts,
				});
			}
		}

		for (const finding of this.getActiveFindings(currentFindings, analysis)) {
			const common = {
				timestamp,
				fingerprint: finding.fingerprint,
				ruleId: finding.ruleId,
				instanceId: finding.instanceId,
				message: finding.message,
				artifacts: finding.artifacts,
			};

			if (finding.requiresVerification) {
				const existing = findingsByFingerprint.get(finding.fingerprint);
				if (existing?.type !== FindingStatus.OBSERVED) {
					await ledger.append({
						type: FindingStatus.UNVERIFIED,
						...common,
						requiresVerification: true,
					});
				}
				continue;
			}

			await ledger.append({
				type: FindingStatus.OBSERVED,

				...common,
			});
		}
	}

	private printRunContext(
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

		this.presenter.runContext([
			'Rules run on current workspace facts collected during this check.',
			`Ledger: ${ledgerScope}.`,
			`Findings shown: ${findingsScope}.`,
			'Insights run on requested rule findings from all current findings, including findings hidden by baselines or active axiom exceptions.',
		]);
	}

	private async printInsights(findings: Finding[], options: { warnAboutScope: boolean }): Promise<void> {
		if (options.warnAboutScope && this.insights.length > 0) {
			this.presenter.warn(
				'Insights analyze requested rule findings from all current findings, including findings hidden by baselines or active axiom exceptions. Insights are read-only and do not affect the check exit code.\n',
			);
		}

		const results = await this.runInsightsIfEnabled(findings);
		if (results.length === 0) {
			return;
		}
		this.presenter.section(`INSIGHTS (${results.length})`);
		for (const result of results) {
			this.presenter.insight(result);
		}
	}

	private evaluateExitConditions(
		visibleFindings: Finding[],
		analysis: LedgerAnalysis,
		options: { printSummary: boolean },
	): void {
		const { hasRegressions, hasExpiredBaselines, activeAxiomCount } = analysis;

		if (hasRegressions || hasExpiredBaselines) {
			if (hasRegressions) {
				this.presenter.error(
					'One or more findings have reappeared after being marked as resolved. Please investigate these regressions.\n',
				);
			}
			if (hasExpiredBaselines) {
				this.presenter.error(
					"One or more baselined findings have expired. Please revisit them: resolve, re-baseline with 'maat baseline', or address the underlying issues.\n",
				);
			}
			process.exit(1);
		}

		const actionableFindings = visibleFindings.filter((f) => !f.requiresVerification);

		if (this.config.check?.strict && actionableFindings.length > 0) {
			this.presenter.error(
				'One or more findings detected. Please address these issues to comply with the defined architecture.\n',
			);
			process.exit(1);
		}

		if (!options.printSummary) {
			return;
		}

		if (visibleFindings.length === 0) {
			const summary =
				activeAxiomCount > 0
					? `No findings detected (${activeAxiomCount} active axiom(s)). Great job!\n`
					: 'No findings detected. Great job!';
			this.presenter.log(summary);
		} else {
			const summary =
				activeAxiomCount > 0
					? `${visibleFindings.length} finding(s) detected, ${activeAxiomCount} active axiom(s). Please review the output above for details.\n`
					: `${visibleFindings.length} finding(s) detected. Please review the output above for details.\n`;
			this.presenter.log(summary);
		}
	}

	private getActiveFindings(
		findings: Finding[],
		analysis: Pick<
			LedgerAnalysis,
			| 'baselinedFingerprints'
			| 'axiomExceptedFingerprints'
			| 'requiringVerificationFingerprints'
			| 'revokedFingerprints'
		>,
	): Finding[] {
		return findings.filter(
			(f) =>
				!analysis.baselinedFingerprints.has(f.fingerprint) &&
				!analysis.axiomExceptedFingerprints.has(f.fingerprint) &&
				!analysis.requiringVerificationFingerprints.has(f.fingerprint) &&
				!analysis.revokedFingerprints.has(f.fingerprint),
		);
	}

	private getVisibleFindings(
		findings: Finding[],
		analysis: Pick<
			LedgerAnalysis,
			| 'baselinedFingerprints'
			| 'axiomExceptedFingerprints'
			| 'requiringVerificationFingerprints'
			| 'revokedFingerprints'
		>,
	): Finding[] {
		return findings.filter(
			(f) =>
				!analysis.baselinedFingerprints.has(f.fingerprint) &&
				!analysis.axiomExceptedFingerprints.has(f.fingerprint) &&
				!analysis.revokedFingerprints.has(f.fingerprint),
		);
	}
}
