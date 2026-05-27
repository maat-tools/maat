import { type Finding, type FindingRecord, FindingStatus } from '@maat-tools/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type VisualizeOptions = {
	filter?: string;
	axioms?: boolean;
	insights?: boolean;
	json?: boolean;
};

type Group = 'resolved' | 'observed' | 'baselined';

const GROUP_ORDER: Group[] = ['resolved', 'observed', 'baselined'];

function classify(record: FindingRecord): Group {
	if (record.state === FindingStatus.RESOLVED) {
		return 'resolved';
	}
	if (record.baselined) {
		return 'baselined';
	}
	return 'observed';
}

function toFinding(record: FindingRecord): Finding {
	return {
		ruleId: record.rule_id,
		message: record.message,
		fingerprint: record.fingerprint,
		artifacts: [...record.artifacts],
	};
}

export class Visualize extends MaatCommandBase implements MaatCommand {
	public async action({ filter, axioms, insights, json }: VisualizeOptions = {}) {
		if (!this.isLedgerProvided()) {
			this.printer.error('No ledger configured. Cannot visualize without a ledger.\n');
			process.exit(1);
		}

		const allFindings = await this.ledger.getAllFindings();
		const allAxioms = await this.ledger.getAllAxioms();

		const activeGroups = filter ? new Set(filter.split(',').map((s) => s.trim() as Group)) : new Set(GROUP_ORDER);

		const grouped = new Map<Group, FindingRecord[]>();
		for (const group of GROUP_ORDER) {
			if (activeGroups.has(group)) {
				grouped.set(
					group,
					allFindings.filter((r) => classify(r) === group),
				);
			}
		}

		if (json) {
			const out: Record<string, unknown> = {
				findings: Object.fromEntries(grouped),
			};
			if (axioms !== false) {
				out.axioms = allAxioms;
			}
			if (insights && this.insights.length > 0) {
				out.insights = await this.runInsightsIfEnabled(allFindings.map(toFinding));
			}
			this.printer.json(out);

			return;
		}

		let hasOutput = false;

		for (const [group, records] of grouped) {
			if (records.length === 0) {
				continue;
			}

			hasOutput = true;
			const heading = `${group.toUpperCase()} (${records.length})`;
			this.printer.section(heading);
			for (const r of records) {
				this.printer.log(`  ${r.fingerprint.slice(0, 8)}`);
				this.printer.info(` [${r.rule_id}]`);
				this.printer.log(` ${r.message}`);
			}
		}

		if (axioms !== false && allAxioms.length > 0) {
			hasOutput = true;
			const heading = `\nAXIOMS (${allAxioms.length})`;
			this.printer.section(heading);
			for (const axiom of allAxioms) {
				const note = axiom.note ? ` — ${axiom.note}` : '';
				this.printer.info(`\n${axiom.axiom_id}`);
				this.printer.bold(` [${axiom.scope}]`);
				this.printer.log(` ${axiom.claim}${note}`);
			}
		}

		if (insights) {
			const results = await this.runInsightsIfEnabled(allFindings.map(toFinding));
			if (results.length > 0) {
				hasOutput = true;
				const heading = `INSIGHTS (${results.length})`;
				this.printer.section(heading);

				for (const result of results) {
					this.printer.insight(result);
				}
			}
		}

		if (!hasOutput) {
			this.printer.log('No findings or axioms in the ledger.');
		}
	}

	public register(): void {
		this.cli
			.command('visualize')
			.description('Display the current state of findings, axioms, and insights from the ledger')
			.option('--filter <states>', 'Comma-separated groups to show: observed, baselined, resolved')
			.option('--no-axioms', 'Hide declared axioms')
			.option('--insights', 'Run insights against the current ledger state')
			.option('--json', 'Output as JSON')
			.action((options: VisualizeOptions) => this.action(options));
	}
}
