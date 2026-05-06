import { FindingStatus, type Finding, type FindingRecord } from '@maat/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type VisualizeOptions = {
	filter?: string;
	axioms?: boolean;
	insights?: boolean;
	json?: boolean;
};

type Group = 'enforced' | 'promoted' | 'observed' | 'baselined';

const GROUP_ORDER: Group[] = ['enforced', 'promoted', 'observed', 'baselined'];

function classify(record: FindingRecord): Group {
	if (record.state === FindingStatus.ENFORCED) {
		return 'enforced';
	}
	if (record.state === FindingStatus.PROMOTED) {
		return 'promoted';
	}
	if (record.state === FindingStatus.BASELINED) {
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
	public async action(options: VisualizeOptions = {}) {
		if (!this.isLedgerProvided()) {
			console.error('No ledger configured. Cannot visualize without a ledger.');
			process.exit(1);
		}

		const snapshot = await this.ledger.getState();
		const allFindings = Object.values(snapshot.findings);
		const allAxioms = Object.values(snapshot.axioms);

		const activeGroups: Set<Group> = options.filter
			? new Set(options.filter.split(',').map((s) => s.trim() as Group))
			: new Set(GROUP_ORDER);

		const grouped = new Map<Group, FindingRecord[]>();
		for (const group of GROUP_ORDER) {
			if (activeGroups.has(group)) {
				grouped.set(group, allFindings.filter((r) => classify(r) === group));
			}
		}

		if (options.json) {
			const out: Record<string, unknown> = {
				findings: Object.fromEntries(grouped),
			};
			if (options.axioms !== false) {
				out.axioms = allAxioms;
			}
			if (options.insights && this.insights.length > 0) {
				out.insights = this.insights.flatMap((i) => i.analyze(allFindings.map(toFinding)));
			}
			console.log(JSON.stringify(out, null, 2));
			return;
		}

		let hasOutput = false;

		for (const [group, records] of grouped) {
			if (records.length === 0) {
				continue;
			}
			hasOutput = true;
			const heading = `${group.toUpperCase()} (${records.length})`;
			console.log(`\n${heading}`);
			console.log('─'.repeat(heading.length));
			for (const r of records) {
				console.log(`  ${r.fingerprint.slice(0, 8)}  [${r.rule_id}] ${r.message}`);
			}
		}

		if (options.axioms !== false && allAxioms.length > 0) {
			hasOutput = true;
			const heading = `AXIOMS (${allAxioms.length})`;
			console.log(`\n${heading}`);
			console.log('─'.repeat(heading.length));
			for (const axiom of allAxioms) {
				const note = axiom.note ? ` — ${axiom.note}` : '';
				console.log(`  ${axiom.axiom_id}  [${axiom.scope}] ${axiom.claim}${note}`);
			}
		}

		if (options.insights && this.insights.length > 0) {
			const results = this.runInsightsIfEnabled(allFindings.map(toFinding));
			if (results.length > 0) {
				hasOutput = true;
				const heading = `INSIGHTS (${results.length})`;
				console.log(`\n${heading}`);
				console.log('─'.repeat(heading.length));
				for (const result of results) {
					console.log(`  [${result.insightId}] ${result.message}`);
				}
			}
		}

		if (!hasOutput) {
			console.log('No findings or axioms in the ledger.');
		}
	}

	public register(): void {
		this.cli
			.command('visualize')
			.description('Display the current state of findings, axioms, and insights from the ledger')
			.option('--filter <states>', 'Comma-separated groups to show: observed, baselined, promoted, enforced')
			.option('--no-axioms', 'Hide declared axioms')
			.option('--insights', 'Run insights against the current ledger state')
			.option('--json', 'Output as JSON')
			.action((options: VisualizeOptions) => this.action(options));
	}
}
