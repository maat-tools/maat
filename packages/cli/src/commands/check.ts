import { FindingStatus } from '@maat/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type CheckOptions = {
	ledger?: boolean;
	showBaselined?: boolean;
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

	public async action(options: CheckOptions = {}) {
		const { findings } = await this.kernel.run();

		const baselinedFingerprints = new Set<string>();

		if (this.ledger !== null) {
			const snapshot = await this.ledger.getState();
			for (const record of Object.values(snapshot.findings)) {
				if (record.baselined) {
					baselinedFingerprints.add(record.fingerprint);
				}
			}
		}

		if (this.ledger !== null && options.ledger !== false) {
			for (const finding of findings) {
				await this.ledger.append(this.ledger.buildEntry(finding, FindingStatus.OBSERVED));
			}
		}

		const visibleFindings = options.showBaselined
			? findings
			: findings.filter((f) => !baselinedFingerprints.has(f.fingerprint));

		if (this.insights.length > 0) {
			for (const insight of this.insights) {
				const results = insight.analyze(visibleFindings);
				for (const result of results) {
					console.log(
						`[Insight: ${result.insightId}] ${result.message}`,
						result.data,
					);
				}
			}
		}

		if (!this.config.check?.strict || visibleFindings.length === 0) {
			return;
		}

		process.exit(1);
	}

	public register(): void {
		this.cli
			.command('check')
			.description('Scan the codebase for architectural findings and append them to the ledger')
			.option('--no-ledger', 'Do not save findings to the ledger')
			.option('--show-baselined', 'Include baselined findings in output and exit code evaluation')
			.action((options: CheckOptions) => this.action(options));
	}
}
