import { FindingStatus } from '@maat-tools/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type VerifyOptions = {
	fingerprint: string;
	revoke?: boolean;
	reason?: string;
};

export class Verify extends MaatCommandBase implements MaatCommand {
	public register(): void {
		this.cli
			.command('verify')
			.description('Verify a probabilistic finding as approved by a human')
			.requiredOption('--fingerprint <fingerprint>', 'Fingerprint of the finding to verify')
			.option('--revoke', 'Revoke a previous verification', false)
			.option('--reason <reason>', 'Optional reason for the verification or revocation')
			.action((options: VerifyOptions) => this.action(options));
	}

	private async action({ fingerprint, revoke, reason }: VerifyOptions) {
		if (!this.isLedgerProvided()) {
			this.presenter.error('No ledger configured. Cannot verify without a ledger.\n');
			process.exit(1);
		}

		const record = await this.ledger.getFindingByFingerprint(fingerprint);
		if (!record) {
			this.presenter.error(`No finding with fingerprint "${fingerprint}" found in the ledger.\n`);
			process.exit(1);
		}

		if (record.type === FindingStatus.OBSERVED) {
			this.presenter.error(`Finding "${fingerprint}" is already verified.\n`);
			process.exit(1);
		}

		if (record.type !== FindingStatus.UNVERIFIED) {
			this.presenter.error(
				`Finding "${fingerprint}" is not in an unverified state. Only unverified findings can be verified or revoked.\n`,
			);
			process.exit(1);
		}

		if (revoke) {
			await this.ledger.append({
				type: FindingStatus.REVOKED,
				timestamp: new Date().toISOString(),
				fingerprint,
				ruleId: record.ruleId,
				instanceId: record.instanceId,
				message: record.message,
				artifacts: record.artifacts,
				...(reason ? { reason } : {}),
			});

			this.presenter.log(`Finding "${fingerprint}" revoked.\n`);
			return;
		}


		await this.ledger.append({
			type: FindingStatus.OBSERVED,
			timestamp: new Date().toISOString(),
			fingerprint,
			ruleId: record.ruleId,
			instanceId: record.instanceId,
			message: record.message,
			artifacts: record.artifacts,
			reason,
		});

		this.presenter.log(`Finding "${fingerprint}" verified(moved to OBSERVED).\n`);
	}
}
