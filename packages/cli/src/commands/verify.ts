import { FindingStatus } from '@maat-tools/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type VerifyOptions = {
	fingerprint: string;
	revoke?: boolean;
	reason?: string;
};

export class Verify extends MaatCommandBase implements MaatCommand {
	public async action({ fingerprint, revoke, reason }: VerifyOptions) {
		if (!this.isLedgerProvided()) {
			this.printer.error('No ledger configured. Cannot verify without a ledger.\n');
			process.exit(1);
		}

		const record = await this.ledger.getFindingByFingerprint(fingerprint);

		if (!record) {
			this.printer.error(`No finding with fingerprint "${fingerprint}" found in the ledger.\n`);
			process.exit(1);
		}

		if (revoke) {
			if (!record.verified) {
				this.printer.warn(`Finding "${fingerprint}" is not verified. Nothing to revoke.\n`);
				return;
			}

			await this.ledger.append({
				type: FindingStatus.REVOKED,
				timestamp: new Date().toISOString(),
				fingerprint,
				reason,
			});

			this.printer.log(`Verification of finding "${fingerprint}" revoked.\n`);
			return;
		}

		if (record.verified) {
			this.printer.warn(`Finding "${fingerprint}" is already verified. Nothing to do.\n`);
			return;
		}

		await this.ledger.append({
			type: FindingStatus.VERIFIED,
			timestamp: new Date().toISOString(),
			fingerprint,
			reason,
		});

		this.printer.log(`Finding "${fingerprint}" verified.\n`);
	}

	public register(): void {
		this.cli
			.command('verify')
			.description('Verify a probabilistic finding as approved by a human')
			.requiredOption('--fingerprint <fingerprint>', 'Fingerprint of the finding to verify')
			.option('--revoke', 'Revoke a previous verification', false)
			.option('--reason <reason>', 'Optional reason for the verification or revocation')
			.action((options: VerifyOptions) => this.action(options));
	}
}
