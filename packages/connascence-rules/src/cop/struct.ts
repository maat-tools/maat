import { type Artifact, defineRule, type FindingRuleOutput, type Rule } from '@maat-tools/contracts';
import {
	POSITIONAL_ACCESSES_CAPABILITY,
	POSITIONAL_SOURCES_CAPABILITY,
	type PositionalAccess,
	type PositionalSource,
} from '@maat-tools/vocabulary';

export type CoPStructRuleOptions = {
	onlyHeterogeneous?: boolean;
};

declare module '@maat-tools/contracts' {
	interface RuleRegistry {
		'@maat-tools/connascence-rules/cop-struct': CoPStructRuleOptions;
	}
}

export class ConnascenceOfPositionStructRule implements Rule<'positionalSources' | 'positionalAccesses'> {
	public readonly id = 'maat-tools/connascence-rules/cop-struct@v1';
	public readonly instanceId = this.id;
	public readonly needFacts = [POSITIONAL_SOURCES_CAPABILITY, POSITIONAL_ACCESSES_CAPABILITY] as const;

	private readonly onlyHeterogeneous: boolean;

	public constructor(options: CoPStructRuleOptions = {}) {
		this.onlyHeterogeneous = options.onlyHeterogeneous ?? true;
	}

	public evaluate(facts: {
		positionalSources: PositionalSource[];
		positionalAccesses: PositionalAccess[];
	}): FindingRuleOutput[] {
		const { positionalSources, positionalAccesses } = facts;
		const accessMap = new Map<string, PositionalAccess[]>();

		for (const acc of positionalAccesses) {
			const key = acc.origin ? `${acc.origin.file}::${acc.origin.name}` : `${acc.file}::${acc.name}`;
			const existing = accessMap.get(key) ?? [];
			existing.push(acc);
			accessMap.set(key, existing);
		}
		const findings: FindingRuleOutput[] = [];

		for (const source of positionalSources) {
			if (this.onlyHeterogeneous && !source.isHeterogeneous) {
				continue;
			}

			const matchedAccesses: PositionalAccess[] = [];
			const intraKey = `${source.file}::${source.name}`;

			const access = accessMap.get(intraKey);
			if (access) {
				matchedAccesses.push(...access);
			}

			if (matchedAccesses.length === 0) {
				continue;
			}

			const artifacts: Artifact[] = [
				{ kind: 'source', data: source },
				...matchedAccesses.map((acc) => ({ kind: 'access' as const, data: acc })),
			];

			const accessSummary = matchedAccesses.map((a) => `${a.file}`).join(', ');

			findings.push({
				ruleId: this.id,
				ruleIdentifier: { name: source.name, file: source.file },
				message: `"${source.name}" in ${source.file} — positional access at ${accessSummary}`,
				artifacts,
			});
		}

		return findings;
	}

	public describeArtifact(artifact: Artifact): Record<string, string> {
		if (artifact.kind === 'source') {
			const src = artifact.data as PositionalSource;
			const loc = `${src.location.file}:${src.location.line}${src.location.column !== undefined ? `:${src.location.column}` : ''}`;
			const positions = src.positions.map((p) => `[${p.index}]: ${p.type}`).join(', ');

			return {
				role: '[Source]',
				location: loc,
				identifier: src.name,
				positions,
			};
		}

		if (artifact.kind === 'access') {
			const acc = artifact.data as PositionalAccess;
			const loc = `${acc.location.file}:${acc.location.line}${acc.location.column !== undefined ? `:${acc.location.column}` : ''}`;

			return {
				role: '[Access]',
				location: loc,
				identifier: acc.name,
				kind: acc.accessKind,
				index: String(acc.accessedIndex),
			};
		}

		return { value: String(artifact.data) };
	}
}

export default defineRule((options?: CoPStructRuleOptions) => new ConnascenceOfPositionStructRule(options));
