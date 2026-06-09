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

		if (revoke && record.state !== FindingStatus.UNVERIFIED) {
			this.printer.error(
				`Finding "${fingerprint}" is not in an unverified state. Only unverified findings can have their verification revoked.\n`,
			);
			process.exit(1);
		}

		if (revoke) {
			await this.ledger.append({
				type: FindingStatus.REVOKED,
				timestamp: new Date().toISOString(),
				fingerprint,
				reason,
			});

			this.printer.log(`Finding "${fingerprint}" revoked.\n`);
			return;
		}

		if (record.state === FindingStatus.OBSERVED) {
			this.printer.warn(`Finding "${fingerprint}" is already verified.\n`);
			return;
		}

		await this.ledger.append({
			type: FindingStatus.OBSERVED,
			timestamp: new Date().toISOString(),
			fingerprint,
			artifacts: record.artifacts,
			rule_id: record.rule_id,
			instance_id: record.instance_id,
			message: record.message,
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
