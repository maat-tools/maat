import type {
	Finding,
	Insight,
	InsightResult,
	LedgerBackend,
} from '@maat/contracts';
import type { MaatConfig } from '@maat/core';
import type { Kernel } from '@maat/kernel';
import type { Command } from 'commander';

export abstract class MaatCommandBase {
	public constructor(
		protected cli: Command,
		protected config: MaatConfig,
		protected kernel: Kernel,
		protected ledger: LedgerBackend | null,
		protected insights: Insight[],
	) {}

	protected isLedgerProvided(): this is { ledger: LedgerBackend } {
		return this.ledger !== null;
	}

	protected runInsightsIfEnabled(visibleFindings: Finding[]): InsightResult[] {
		if (this.insights.length === 0) {
			return [];
		}
		const allResults: InsightResult[] = [];
		for (const insight of this.insights) {
			allResults.push(...insight.analyze(visibleFindings));
		}

		return allResults;
	}
}
