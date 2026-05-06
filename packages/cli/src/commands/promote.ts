import { FindingStatus } from '@maat/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type PromoteOptions = {
	fingerprint: string;
	enforce?: boolean;
};

export class Promote extends MaatCommandBase implements MaatCommand {
	public async action({ fingerprint, enforce }: PromoteOptions) {
		if (!this.isLedgerProvided()) {
			console.error('No ledger configured. Cannot promote without a ledger.');
			process.exit(1);
		}

		const snapshot = await this.ledger.getState();
		const record = snapshot.findings[fingerprint];

		if (record === undefined) {
			console.error(
				`No finding with fingerprint "${fingerprint}" found in the ledger.`,
			);
			process.exit(1);
		}

		if (record.state === FindingStatus.ENFORCED) {
			console.warn(
				`Finding "${fingerprint}" is already enforced. Nothing to do.`,
			);
			return;
		}

		if (record.state === FindingStatus.PROMOTED && !enforce) {
			console.warn(
				`Finding "${fingerprint}" is already promoted. Use --enforce to escalate.`,
			);
			return;
		}

		const timestamp = new Date().toISOString();

		if (record.state === FindingStatus.OBSERVED) {
			await this.ledger.append({
				type: FindingStatus.PROMOTED,
				timestamp,
				fingerprint,
			});
			console.log(`Finding "${fingerprint}" promoted.`);
		}

		if (enforce) {
			await this.ledger.append({
				type: FindingStatus.ENFORCED,
				timestamp,
				fingerprint,
			});
			console.log(`Finding "${fingerprint}" enforced.`);
		}
	}

	public register(): void {
		this.cli
			.command('promote')
			.description(
				'Promote an observed finding to acknowledged, optionally escalating it to an enforced gate',
			)
			.requiredOption(
				'--fingerprint <fingerprint>',
				'Fingerprint of the finding to promote',
			)
			.option(
				'--enforce',
				'Escalate directly to enforced — maat check will fail if this finding is detected',
			)
			.action((options: PromoteOptions) => this.action(options));
	}
}
