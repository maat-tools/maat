import type { Finding, Insight, InsightResult, LedgerBackend } from '@maat-tools/contracts';
import type { MaatConfig } from '@maat-tools/core';
import type { Kernel } from '@maat-tools/kernel';
import type { Command } from 'commander';
import type { Printer } from '../printer';

export abstract class MaatCommandBase {
	public constructor(
		protected cli: Command,
		protected config: MaatConfig,
		protected kernel: Kernel,
		protected insights: Insight[],
		protected printer: Printer,
		protected ledger: LedgerBackend | null,
	) {}

	protected isLedgerProvided(): this is { ledger: LedgerBackend } {
		return this.ledger !== null;
	}

	protected async runInsightsIfEnabled(visibleFindings: Finding[]): Promise<InsightResult[]> {
		if (this.insights.length === 0) {
			return [];
		}

		const resultsByInsight = await Promise.all(
			this.insights.map((insight) => insight.analyze(this.findingsForInsight(visibleFindings, insight))),
		);

		return resultsByInsight.flat();
	}

	private findingsForInsight(findings: Finding[], insight: Insight): Finding[] {
		return findings.filter((finding) =>
			insight.needRules.some((ruleId) => this.findingMatchesNeededRule(finding.ruleId, ruleId)),
		);
	}

	private findingMatchesNeededRule(findingRuleId: string, neededRuleId: string): boolean {
		return (
			findingRuleId === neededRuleId ||
			findingRuleId.startsWith(`${neededRuleId}:`) ||
			findingRuleId.startsWith(`${neededRuleId}@`)
		);
	}
}
