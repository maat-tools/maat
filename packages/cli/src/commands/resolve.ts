import { FindingStatus } from '@maat-tools/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type ResolveOptions = {
	fingerprint: string;
};

export class Resolve extends MaatCommandBase implements MaatCommand {
	public async action({ fingerprint }: ResolveOptions) {
		if (!this.isLedgerProvided()) {
			this.printer.error('No ledger configured. Cannot resolve without a ledger.');
			process.exit(1);
		}

		const snapshot = await this.ledger.getState();
		const record = snapshot.findings[fingerprint];

		if (record === undefined) {
			this.printer.error(`No finding with fingerprint "${fingerprint}" found in the ledger.`);
			process.exit(1);
		}

		if (record.state === FindingStatus.RESOLVED) {
			this.printer.warn(`Finding "${fingerprint}" is already resolved. Nothing to do.`);
			
			return;
		}

		await this.ledger.append({
			type: FindingStatus.RESOLVED,
			timestamp: new Date().toISOString(),
			fingerprint,
		});

		this.printer.log(`Finding "${fingerprint}" resolved.`);
	}

	public register(): void {
		this.cli
			.command('resolve')
			.description('Mark a finding fingerprint as intentionally fixed')
			.requiredOption('--fingerprint <fingerprint>', 'Fingerprint of the finding to resolve')
			.action((options: ResolveOptions) => this.action(options));
	}
}
