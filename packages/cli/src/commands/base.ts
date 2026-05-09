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
