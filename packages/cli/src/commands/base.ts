import type { Insight, LedgerBackend } from '@maat/contracts';
import type { MaatConfig } from '@maat/core';
import type { Kernel } from '@maat/kernel';
import type { Command } from 'commander';

export abstract class MaatCommandBase {
	constructor(
		protected cli: Command,
		protected config: MaatConfig,
		protected kernel: Kernel,
		protected ledger: LedgerBackend | null,
		protected insights: Insight[],
	) {}
}
