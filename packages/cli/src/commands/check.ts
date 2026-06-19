import { type Finding, type FindingEvent, FindingStatus } from '@maat-tools/contracts';
import type { KernelProgressEvent } from '@maat-tools/kernel';
import { createSpinner } from '../spinner';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type CheckOptions = {
	ledger?: boolean;
	silent?: boolean;
	noCache?: boolean;
};

type RegressionDetail = {
	fingerprint: string;
	message: string;
	reason?: string;
};

type RegressionToVerifyDetail = {
	fingerprint: string;
	message: string;
};

type ExpiredBaselineDetail = {
	fingerprint: string;
	message: string;
	expiredAt: string;
};

type LedgerReconciliation = {
	baselinedFingerprints: Set<string>;
	expiredBaselines: ExpiredBaselineDetail[];
	requiringVerificationFingerprints: Set<string>;
	revokedFingerprints: Set<string>;
	regressions: RegressionDetail[];
	regressionsToVerify: RegressionToVerifyDetail[];
	automaticallyResolvedFingerprints: Set<string>;
	newFindings: Set<string>;
};

export class Check extends MaatCommandBase implements MaatCommand {
	public register(): void {
		this.cli
			.command('check')
			.description('Scan the codebase for architectural findings')
			.option('--ledger', 'Save findings to the ledger')
			.option('--silent', 'Suppress all console output (exit code still reflects findings)')
			.option('--no-cache', 'Disable caching of enricher results')
			.action((options: CheckOptions) => this.action(options));
	}

	private async action(options: CheckOptions = {}) {
		if (options.ledger === true && !this.isLedgerProvided()) {
			this.presenter.error(
				'Ledger option enabled, but no ledger configured. Please configure a ledger in your maat.config.ts to be able to save findings.\n',
			);
			process.exit(1);
		}

		if (options.silent) {
			this.presenter = this.presenter.asSilent();
		}

		const spinner = options.silent ? null : createSpinner();
		const totalLLMCosts = { usedTokens: 0, cost: 0, hasUsedLLM: false };
		const { findings: findingsFromTheCurrentRun, warnings: warningsFromTheCurrentRun } = await this.kernel
			.run({
				useCache: !options.noCache,
				onProgress: (event: KernelProgressEvent) => {
					if (event.type === 'collector:start') {
						spinner?.update(`Collecting ${event.collectorId} (${event.index + 1}/${event.total})`);
					}
					if (event.type === 'enricher:start') {
						spinner?.update(`Enriching ${event.enricherId} (${event.index + 1}/${event.total})`);
					}
					if (event.type === 'enricher:done') {
						if (event.enriched.usedTokens) {
							totalLLMCosts.hasUsedLLM = true;
							totalLLMCosts.usedTokens += event.enriched.usedTokens;
						}
						if (event.enriched.cost) {
							totalLLMCosts.hasUsedLLM = true;
							totalLLMCosts.cost += event.enriched.cost;
						}
					}
				},
			})
			.finally(() => spinner?.stop());

		const actionableFindingsFromTheCurrentRun = findingsFromTheCurrentRun.filter((f) => !f.requiresVerification);
		if (!this.isLedgerProvided()) {
			this.printLLMSummaryIfNecessary(totalLLMCosts);
			this.presenter.findings(findingsFromTheCurrentRun, (id) => this.kernel.getRuleById(id));
			if (actionableFindingsFromTheCurrentRun.length !== findingsFromTheCurrentRun.length) {
				this.presenter.warn(
					"Some findings are marked [Verify] but no ledger is configured, so they can't be verified or tracked. They're shown for visibility only. Configure a ledger in maat.config.ts to verify and track them.",
				);
			}
			if (this.config.check?.strict && actionableFindingsFromTheCurrentRun.length > 0) {
				this.presenter.error(
					'One or more findings that violate the defined architecture detected. Please address these issues to comply with it.\n',
				);
				process.exit(1);
			}

			if (findingsFromTheCurrentRun.length === 0) {
				this.presenter.log('No findings detected. Great job!');
				return;
			}

			this.presenter.log(
				`${findingsFromTheCurrentRun.length} finding(s) detected. Please review the output above for details.\n`,
			);
			return;
		}

		const allFindingsState = await this.ledger.getAllFindingsState();
		const reconciliation = await this.reconcileCurrentRunWithLedgerState(allFindingsState, findingsFromTheCurrentRun);

		if (options.ledger === true) {
			await this.syncLedgerEvents(allFindingsState, findingsFromTheCurrentRun, reconciliation);
		}

		const visibleFindings = this.removeSkippedFindings(findingsFromTheCurrentRun, reconciliation);

		this.presenter.findings(visibleFindings, (id) => this.kernel.getRuleById(id));
		warningsFromTheCurrentRun?.forEach((warning) => {
			this.presenter.warn(`${warning}\n`);
		});
		this.printLLMSummaryIfNecessary(totalLLMCosts);
		this.evaluateExitConditions(visibleFindings, reconciliation, actionableFindingsFromTheCurrentRun);
	}

	private removeSkippedFindings(findings: Finding[], reconciliation: LedgerReconciliation): Finding[] {
		return findings.filter(
			(f) =>
				!reconciliation.baselinedFingerprints.has(f.fingerprint) &&
				!reconciliation.revokedFingerprints.has(f.fingerprint) &&
				!reconciliation.automaticallyResolvedFingerprints.has(f.fingerprint),
		);
	}

	private async reconcileCurrentRunWithLedgerState(
		findingsFromLedger: FindingEvent[],
		findingsFromTheCurrentRun: Finding[],
	): Promise<LedgerReconciliation> {
		const baselinedFingerprints = new Set<string>();
		const requiringVerificationFingerprints = new Set<string>();
		const revokedFingerprints = new Set<string>();
		const automaticallyResolvedFingerprints = new Set<string>();
		const newFindings = new Set<string>();

		const regressions: RegressionDetail[] = [];
		const regressionsToVerify: RegressionToVerifyDetail[] = [];
		const expiredBaselines: ExpiredBaselineDetail[] = [];

		const now = Date.now();

		const findingsFromLedgerByFingerprint = new Map(findingsFromLedger.map((r) => [r.fingerprint, r]));
		const findingsFromTheCurrentRunByFingerprint = new Map(findingsFromTheCurrentRun.map((f) => [f.fingerprint, f]));

		for (const record of findingsFromLedger) {
			const currentFinding = findingsFromTheCurrentRunByFingerprint.get(record.fingerprint);
			if (record.type === FindingStatus.BASELINED) {
				const expired = new Date(record.expiresAt).getTime() <= now;
				const hasGone = !currentFinding;
				if (expired) {
					expiredBaselines.push({
						fingerprint: record.fingerprint,
						message: record.message,
						expiredAt: record.expiresAt,
					});
					if (!hasGone) {
						newFindings.add(record.fingerprint);
					}
				} else {
					baselinedFingerprints.add(record.fingerprint);
				}
				if (hasGone) {
					automaticallyResolvedFingerprints.add(record.fingerprint);
				}
			}

			const isARegression = record.type === FindingStatus.RESOLVED && currentFinding;
			if (isARegression) {
				if (currentFinding.requiresVerification) {
					regressionsToVerify.push({
						fingerprint: record.fingerprint,
						message: currentFinding.message,
					});
				} else {
					regressions.push({
						fingerprint: record.fingerprint,
						message: currentFinding.message,
						reason: record.reason,
					});
				}
				newFindings.add(record.fingerprint);
			}
			if (record.type === FindingStatus.UNVERIFIED && currentFinding) {
				requiringVerificationFingerprints.add(record.fingerprint);
			}
			if (record.type === FindingStatus.REVOKED && currentFinding) {
				revokedFingerprints.add(record.fingerprint);
			}
			if ((record.type === FindingStatus.OBSERVED || record.type === FindingStatus.UNVERIFIED) && !currentFinding) {
				automaticallyResolvedFingerprints.add(record.fingerprint);
			}
		}

		[...findingsFromTheCurrentRunByFingerprint.keys()]
			.filter((fp) => !findingsFromLedgerByFingerprint.has(fp))
			.forEach((fp) => {
				newFindings.add(fp);
			});

		return {
			baselinedFingerprints,
			expiredBaselines,
			requiringVerificationFingerprints,
			revokedFingerprints,
			regressions,
			regressionsToVerify,
			automaticallyResolvedFingerprints,
			newFindings,
		};
	}

	private printLLMSummaryIfNecessary({
		usedTokens,
		cost,
		hasUsedLLM,
	}: {
		usedTokens: number;
		cost: number;
		hasUsedLLM: boolean;
	}): void {
		if (hasUsedLLM) {
			this.presenter.info(
				`\nLLM costs: $${cost === 0 ? '0.000000' : cost.toFixed(6)} (${usedTokens === 0 ? '0' : usedTokens.toLocaleString()} tokens)\n`,
			);
		}
	}

	private async syncLedgerEvents(
		allFindingsFromLedger: FindingEvent[],
		findingsFromTheCurrentRun: Finding[],
		reconciliation: LedgerReconciliation,
	): Promise<void> {
		if (!this.isLedgerProvided()) {
			throw new Error('Ledger is not configured');
		}

		const timestamp = new Date().toISOString();
		if (reconciliation.automaticallyResolvedFingerprints.size > 0) {
			const findingsFromLedgerByFingerprint = new Map(allFindingsFromLedger.map((r) => [r.fingerprint, r]));
			for (const fingerprint of reconciliation.automaticallyResolvedFingerprints) {
				const finding = findingsFromLedgerByFingerprint.get(fingerprint);
				if (!finding) {
					this.presenter.warn(
						`Finding with fingerprint "${fingerprint}" not found in ledger (While automatically resolving).`,
					);
					continue;
				}

				await this.ledger.append({
					type: FindingStatus.RESOLVED,
					timestamp,
					fingerprint: finding.fingerprint,
					ruleId: finding.ruleId,
					instanceId: finding.instanceId,
					message: finding.message,
					artifacts: finding.artifacts,
				});
			}
		}
		if (reconciliation.newFindings.size > 0) {
			const findingsFromTheCurrentRunByFingerprint = new Map(findingsFromTheCurrentRun.map((f) => [f.fingerprint, f]));
			for (const fingerprint of reconciliation.newFindings) {
				const finding = findingsFromTheCurrentRunByFingerprint.get(fingerprint);
				if (!finding) {
					this.presenter.warn(
						`Finding with fingerprint "${fingerprint}" not found in current findings (While adding new findings to ledger).`,
					);
					continue;
				}

				if (finding.requiresVerification) {
					await this.ledger.append({
						type: FindingStatus.UNVERIFIED,
						timestamp,
						fingerprint: finding.fingerprint,
						ruleId: finding.ruleId,
						instanceId: finding.instanceId,
						message: finding.message,
						artifacts: finding.artifacts,
						requiresVerification: true,
						reason: 'This finding requires verification. Please review and verify it.',
					});
					continue;
				}
				await this.ledger.append({
					type: FindingStatus.OBSERVED,
					timestamp,
					fingerprint: finding.fingerprint,
					ruleId: finding.ruleId,
					instanceId: finding.instanceId,
					message: finding.message,
					artifacts: finding.artifacts,
				});
			}
		}
	}

	private evaluateExitConditions(
		visibleFindings: Finding[],
		reconciliation: LedgerReconciliation,
		actionableFindingsFromTheCurrentRun: Finding[],
	): void {
		const { regressions, regressionsToVerify, expiredBaselines } = reconciliation;
		const hasFailures = regressions.length > 0 || regressionsToVerify.length > 0 || expiredBaselines.length > 0;

		if (hasFailures) {
			if (regressions.length > 0) {
				this.presenter.error(this.formatRegressions(regressions));
			}
			if (regressionsToVerify.length > 0) {
				this.presenter.error(this.formatRegressionsToVerify(regressionsToVerify));
			}
			if (expiredBaselines.length > 0) {
				this.presenter.error(this.formatExpiredBaselines(expiredBaselines));
			}
			process.exit(1);
		}

		if (
			this.config.check?.strict &&
			this.removeSkippedFindings(actionableFindingsFromTheCurrentRun, reconciliation).length > 0
		) {
			this.presenter.error(
				'One or more findings that violate the defined architecture detected. Please address these issues to comply with it.\n',
			);
			this.presenter.warn('Remember to use "maat baseline" to baseline any new findings that are accepted.\n');
			process.exit(1);
		}

		if (visibleFindings.length === 0) {
			this.presenter.log('No findings detected. Great job!');
			return;
		}

		this.presenter.log(`${visibleFindings.length} finding(s) detected. Please review the output above for details.\n`);
	}

	private formatRegressions(regressions: RegressionDetail[]): string {
		const lines = regressions.map((regression) => {
			const reason = regression.reason ? ` (reason: ${regression.reason})` : '';
			return `  - ${regression.fingerprint}: ${regression.message}${reason}`;
		});

		return `One or more findings marked as resolved have reappeared (regression):\n\n${lines.join('\n')}\n\nPlease investigate these regressions.\n`;
	}

	private formatRegressionsToVerify(regressionsToVerify: RegressionToVerifyDetail[]): string {
		const lines = regressionsToVerify.map((regression) => `  - ${regression.fingerprint}: ${regression.message}`);

		return `One or more findings marked as resolved have reappeared as requiring verification (regression to verify):\n\n${lines.join('\n')}\n\nPlease verify them before treating them as confirmed regressions.\n`;
	}

	private formatExpiredBaselines(expiredBaselines: ExpiredBaselineDetail[]): string {
		const lines = expiredBaselines.map((baseline) => {
			const expiredAt = new Date(baseline.expiredAt).toISOString().slice(0, 10);
			return `  - ${baseline.fingerprint}: ${baseline.message} (expired at ${expiredAt})`;
		});

		return `One or more baselined findings have expired:\n\n${lines.join('\n')}\n\nPlease revisit them: resolve, re-baseline with 'maat baseline', or address the underlying issues.\n`;
	}
}
