import { FindingStatus } from '@maat/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type ResolveOptions = {
	fingerprint: string;
};

export class Resolve extends MaatCommandBase implements MaatCommand {
	public async action(options: ResolveOptions) {
		if (!this.isLedgerProvided()) {
			console.error('No ledger configured. Cannot resolve without a ledger.');
			process.exit(1);
		}

		const snapshot = await this.ledger.getState();
		const record = snapshot.findings[options.fingerprint];

		if (record === undefined) {
			console.error(`No finding with fingerprint "${options.fingerprint}" found in the ledger.`);
			process.exit(1);
		}

		if (record.state !== FindingStatus.PROMOTED && record.state !== FindingStatus.ENFORCED) {
			console.error(
				`Finding "${options.fingerprint}" is in state "${record.state}" and cannot be resolved. ` +
				`Only findings in "${FindingStatus.PROMOTED}" or "${FindingStatus.ENFORCED}" state can be explicitly resolved.`,
			);
			process.exit(1);
		}

		await this.ledger.append({
			type: FindingStatus.RESOLVED,
			timestamp: new Date().toISOString(),
			fingerprint: options.fingerprint,
		});

		console.log(`Finding "${options.fingerprint}" resolved.`);
	}

	public register(): void {
		this.cli
			.command('resolve')
			.description('Explicitly resolve a finding that was marked absent — confirming it has been intentionally fixed')
			.requiredOption('--fingerprint <fingerprint>', 'Fingerprint of the finding to resolve')
			.action((options: ResolveOptions) => this.action(options));
	}
}
