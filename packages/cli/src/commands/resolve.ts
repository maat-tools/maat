import { FindingStatus } from '@maat-tools/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type ResolveOptions = {
	fingerprint: string;
};

export class Resolve extends MaatCommandBase implements MaatCommand {
	public register(): void {
		this.cli
			.command('resolve')
			.description('Mark a finding fingerprint as intentionally fixed')
			.requiredOption('--fingerprint <fingerprint>', 'Fingerprint of the finding to resolve')
			.action((options: ResolveOptions) => this.action(options));
	}

	private async action({ fingerprint }: ResolveOptions) {
		if (!this.isLedgerProvided()) {
			this.presenter.error('No ledger configured. Cannot resolve without a ledger.\n');
			process.exit(1);
		}

		const record = await this.ledger.getFindingByFingerprint(fingerprint);

		if (!record) {
			this.presenter.error(`No finding with fingerprint "${fingerprint}" found in the ledger.\n`);
			process.exit(1);
		}

		if (record.type === FindingStatus.RESOLVED) {
			this.presenter.warn(`Finding "${fingerprint}" is already resolved. Nothing to do.\n`);

			return;
		}

		await this.ledger.append({
			type: FindingStatus.RESOLVED,
			timestamp: new Date().toISOString(),
			fingerprint,
			ruleId: record.ruleId,
			instanceId: record.instanceId,
			message: record.message,
			artifacts: record.artifacts,
		});

		this.presenter.log(`Finding "${fingerprint}" resolved.\n`);
	}
}
