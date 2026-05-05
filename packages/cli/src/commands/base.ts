import type { Insight, LedgerBackend } from '@maat/contracts';
import type { Kernel } from '@maat/kernel';
import type { Command } from 'commander';

export abstract class MaatCommandBase {
	constructor(
		protected cli: Command,
		protected kernel: Kernel,
		protected ledger: LedgerBackend | null,
		protected insights: Insight[],
	) {}
}
