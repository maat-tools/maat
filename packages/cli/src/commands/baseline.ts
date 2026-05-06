import { FindingStatus } from '@maat/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

export class Baseline extends MaatCommandBase implements MaatCommand {
	public async action() {
		if (!this.isLedgerProvided()) {
			this.printer.error('No ledger configured. Cannot baseline without a ledger.');
			process.exit(1);
		}

		const snapshot = await this.ledger.getState();
		const toBaseline = Object.values(snapshot.findings).filter((r) => !r.baselined);

		if (toBaseline.length === 0) {
			this.printer.log('Nothing to baseline. All observed findings are already baselined.');
			return;
		}

		for (const record of toBaseline) {
			await this.ledger.append({
				type: FindingStatus.BASELINED,
				timestamp: new Date().toISOString(),
				fingerprint: record.fingerprint,
			});
		}

		this.printer.log(`Baselined ${toBaseline.length} finding(s).`);
	}

	public register(): void {
		this.cli
			.command('baseline')
			.description('Baseline all currently observed findings, suppressing them from future check output')
			.action(() => this.action());
	}
}
