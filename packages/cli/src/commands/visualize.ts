import { type Finding, type FindingEvent, FindingStatus } from '@maat-tools/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type VisualizeOptions = {
	filter?: string;
	axioms?: boolean;
	insights?: boolean;
	json?: boolean;
};

type Group = 'resolved' | 'observed' | 'baselined' | 'unverified' | 'revoked';

const DEFAULT_GROUP_ORDER: Group[] = ['observed', 'baselined', 'resolved', 'unverified', 'revoked'];

function classify(record: FindingEvent): Group {
	if (record.type === FindingStatus.RESOLVED) {
		return 'resolved';
	}
	if (record.type === FindingStatus.BASELINED) {
		return 'baselined';
	}
	if (record.type === FindingStatus.UNVERIFIED) {
		return 'unverified';
	}
	if (record.type === FindingStatus.REVOKED) {
		return 'revoked';
	}

	return 'observed';
}

function toFinding(record: FindingEvent): Finding {
	return {
		ruleId: record.ruleId,
		instanceId: record.instanceId,
		message: record.message,
		fingerprint: record.fingerprint,
		artifacts: [...record.artifacts],
		...(record.type === FindingStatus.UNVERIFIED ? { requiresVerification: true } : {}),
	};
}

export class Visualize extends MaatCommandBase implements MaatCommand {
	public register(): void {
		this.cli
			.command('visualize')
			.description('Display the current state of findings, axioms, and insights from the ledger')
			.option('--filter <states>', 'Comma-separated groups to show: observed, baselined, resolved, unverified, revoked')
			.option('--no-axioms', 'Hide declared axioms')
			.option('--insights', 'Run insights against the current ledger state')
			.option('--json', 'Output as JSON')
			.action((options: VisualizeOptions) => this.action(options));
	}

	private async action({ filter, axioms, insights, json }: VisualizeOptions = {}) {
		if (!this.isLedgerProvided()) {
			this.presenter.error('No ledger configured. Cannot visualize without a ledger.\n');
			process.exit(1);
		}

		const allFindingsState = await this.ledger.getAllFindingsState();
		const allAxiomsState = await this.ledger.getAllAxiomsState();
		const onlyActiveAxioms = allAxiomsState.filter((a) => a.type === FindingStatus.AXIOM_DECLARED);

		if (filter) {
			filter.split(',').forEach((group) => {
				if (!DEFAULT_GROUP_ORDER.includes(group.trim() as Group)) {
					this.presenter.error(`Invalid group "${group.trim()}". Valid groups are: ${DEFAULT_GROUP_ORDER.join(', ')}.`);
					process.exit(1);
				}
			});
		}

		const activeGroups: Set<Group> = filter
			? new Set(filter.split(',').map((s) => s.trim() as Group))
			: new Set(DEFAULT_GROUP_ORDER);

		const groupedFindings = new Map<Group, FindingEvent[]>();
		for (const finding of allFindingsState) {
			const group = classify(finding);
			if (!activeGroups.has(group)) {
				continue;
			}

			groupedFindings.getOrInsert(group, []).push(finding);
		}

		if (json) {
			const out = {
				findings: Object.fromEntries(groupedFindings),
				...(axioms ? { axioms: onlyActiveAxioms } : {}),
				...(insights && this.insights.length > 0
					? { insights: await this.runInsightsIfEnabled(allFindingsState.map(toFinding)) }
					: {}),
			};

			this.presenter.json(out);

			return;
		}

		const onlyGroupsWithFindings = Array.from(groupedFindings.entries()).filter(([_, records]) => records.length > 0);
		if (
			onlyGroupsWithFindings.length === 0 &&
			(!axioms || onlyActiveAxioms.length === 0) &&
			(!insights || this.insights.length === 0)
		) {
			this.presenter.log('No findings or axioms in the ledger.');
			return;
		}

		for (const [group, records] of onlyGroupsWithFindings) {
			const heading = `${group.toUpperCase()} (${records.length})`;
			this.presenter.section(heading);
			this.presenter.findingGroup(records.map(toFinding), (id) => this.kernel.getRuleById(id));
		}

		if (axioms && onlyActiveAxioms.length > 0) {
			const heading = `AXIOMS (${onlyActiveAxioms.length})`;
			this.presenter.section(heading);
			this.presenter.log('Only active (excluding revoked and superseded) axioms are shown.\n');

			for (const axiom of onlyActiveAxioms) {
				this.presenter.axiomEntry(axiom);
			}
		}

		if (insights) {
			const results = await this.runInsightsIfEnabled(allFindingsState.map(toFinding));
			if (results.length > 0) {
				const heading = `INSIGHTS (${results.length})`;
				this.presenter.section(heading);

				for (const result of results) {
					this.presenter.insightEntry(result);
				}
			}
		}
	}
}
