import { FindingStatus } from '@maat-tools/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

const BASELINE_MIN_DAYS = 90;
const BASELINE_MAX_DAYS = 120;
const BASELINE_DEFAULT_DAYS = 90;

type BaselineOptions = {
	expiresIn?: string;
};

export class Baseline extends MaatCommandBase implements MaatCommand {
	public async action(options: BaselineOptions = {}) {
		if (!this.isLedgerProvided()) {
			this.printer.error('No ledger configured. Cannot baseline without a ledger.');
			process.exit(1);
		}

		const expiresInDays = this.resolveExpiresIn(options.expiresIn);
		if (expiresInDays === null) {
			process.exit(1);
		}

		const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

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
				expires_at: expiresAt,
			});
		}

		this.printer.log(
			`Baselined ${toBaseline.length} finding(s). Baseline expires in ${expiresInDays} day(s) on ${expiresAt.slice(0, 10)}.`,
		);
	}

	private resolveExpiresIn(raw: string | undefined): number | null {
		if (raw === undefined) {
			return BASELINE_DEFAULT_DAYS;
		}

		const days = Number(raw);
		if (!Number.isInteger(days) || Number.isNaN(days)) {
			this.printer.error(`--expires-in must be an integer number of days.`);
			return null;
		}
		if (days < BASELINE_MIN_DAYS) {
			this.printer.error(`--expires-in must be at least ${BASELINE_MIN_DAYS} days. Got: ${days}.`);
			return null;
		}
		if (days > BASELINE_MAX_DAYS) {
			this.printer.error(`--expires-in must be at most ${BASELINE_MAX_DAYS} days. Got: ${days}.`);
			return null;
		}
		return days;
	}

	public register(): void {
		this.cli
			.command('baseline')
			.description('Baseline all currently observed findings, suppressing them from future check output')
			.option(
				'--expires-in <days>',
				`Number of days before the baseline expires and must be revisited (${BASELINE_MIN_DAYS}–${BASELINE_MAX_DAYS})`,
				String(BASELINE_DEFAULT_DAYS),
			)
			.action((options: BaselineOptions) => this.action(options));
	}
}
