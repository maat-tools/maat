import { FindingStatus } from '@maat/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type CheckOptions = {
	ledger?: boolean;
};

const _origLog = console.log;
console.log = (...args: unknown[]) =>
	_origLog(
		...args.map((a) =>
			typeof a === 'object' && a !== null
				? Bun.inspect(a, { depth: undefined })
				: a,
		),
	);

export class Check extends MaatCommandBase implements MaatCommand {
	public name = 'check';
	public description = 'Run checks';

	public async action(options: CheckOptions = {}) {
		const { findings } = await this.kernel.run();

		if (this.ledger !== null && options.ledger !== false) {
			for (const finding of findings) {
				await this.ledger.append(this.ledger.buildEntry(finding, FindingStatus.OBSERVED));
			}
		}

		if (this.insights.length > 0) {
			for (const insight of this.insights) {
				const results = insight.analyze(findings);
				for (const result of results) {
					console.log(
						`[Insight: ${result.insightId}] ${result.message}`,
						result.data,
					);
				}
			}
		}

		if (!this.config.check?.strict || findings.length === 0) {
			return;
		}

		process.exit(1);
	}

	public register(): void {
		this.cli
			.command(this.name)
			.description(this.description)
			.option('--no-ledger', 'Do not save findings to the ledger')
			.action((options: CheckOptions) => this.action(options));
	}
}
