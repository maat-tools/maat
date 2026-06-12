import { FindingStatus } from '@maat-tools/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

const BASELINE_MAX_DAYS = 90;
const BASELINE_DEFAULT_DAYS = 30;

type BaselineOptions = {
	expiresIn?: string;
};

export class Baseline extends MaatCommandBase implements MaatCommand {

	public register(): void {
		this.cli
			.command('baseline')
			.description('Baseline all currently observed findings, suppressing them from future check output')
			.option(
				'--expires-in <days>',
				`Number of days before the baseline expires and must be revisited (1–${BASELINE_MAX_DAYS}, default: ${BASELINE_DEFAULT_DAYS})`,
				String(BASELINE_DEFAULT_DAYS),
			)
			.action((options: BaselineOptions) => this.action(options));
	}

	private async action(options: BaselineOptions = {}) {
		if (!this.isLedgerProvided()) {
			this.presenter.error('No ledger configured. Cannot baseline without a ledger.');
			process.exit(1);
		}

		const expiresInDays = this.resolveExpiresIn(options.expiresIn);
		if (expiresInDays === null) {
			process.exit(1);
		}

		const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

		const toBaseline = await this.ledger.getNotBaselinedFindingsState();

		if (toBaseline.length === 0) {
			this.presenter.log('Nothing to baseline. All observed findings are already baselined.');
			return;
		}

		for (const record of toBaseline) {
			await this.ledger.append({
				type: FindingStatus.BASELINED,
				timestamp: new Date().toISOString(),
				fingerprint: record.fingerprint,
				ruleId: record.ruleId,
				instanceId: record.instanceId,
				message: record.message,
				artifacts: record.artifacts,
				expiresAt: expiresAt,
			});
		}

		this.presenter.log(
			`Baselined ${toBaseline.length} finding(s). Baseline expires in ${expiresInDays} day(s) on ${expiresAt.slice(0, 10)}.\n`,
		);
	}

	private resolveExpiresIn(raw: string | undefined): number | null {
		if (!raw) {
			return BASELINE_DEFAULT_DAYS;
		}

		const days = Number(raw);
		if (!Number.isInteger(days) || Number.isNaN(days)) {
			this.presenter.error(`--expires-in must be an integer number of days.\n`);

			return null;
		}
		if (days < 1) {
			this.presenter.error(`--expires-in must be at least 1 day. Got: ${days}.\n`);

			return null;
		}
		if (days > BASELINE_MAX_DAYS) {
			this.presenter.error(`--expires-in must be at most ${BASELINE_MAX_DAYS} days. Got: ${days}.\n`);

			return null;
		}

		return days;
	}


}
