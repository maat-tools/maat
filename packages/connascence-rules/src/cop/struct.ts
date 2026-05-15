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
	public readonly id = 'cop-struct@v1';
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
			const key = `${acc.file}::${acc.variableName}`;
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

			const intraKey = `${source.file}::${source.variableName}`;
			const intraAccesses = accessMap.get(intraKey);
			if (intraAccesses) {
				matchedAccesses.push(...intraAccesses);
			}

			for (const callSite of source.callSites ?? []) {
				const callKey = `${callSite.file}::${callSite.variableName}`;
				const callAccesses = accessMap.get(callKey);
				if (callAccesses) {
					matchedAccesses.push(...callAccesses);
				}
			}

			if (matchedAccesses.length === 0) {
				continue;
			}

			const artifacts: Artifact[] = [
				{ kind: 'source', data: source },
				...matchedAccesses.map((acc) => ({ kind: 'access' as const, data: acc })),
			];

			const accessSummary = matchedAccesses.map((a) => `${a.file}[${a.accessedIndex}]`).join(', ');

			findings.push({
				ruleId: this.id,
				ruleIdentifier: { variable: source.variableName, file: source.file },
				message: `"${source.variableName}" in ${source.file} — positional access at ${accessSummary}`,
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
				location: loc,
				variable: src.variableName,
				role: 'Definition (source)',
				positions,
			};
		}

		if (artifact.kind === 'access') {
			const acc = artifact.data as PositionalAccess;
			const loc = `${acc.location.file}:${acc.location.line}${acc.location.column !== undefined ? `:${acc.location.column}` : ''}`;
			return {
				location: loc,
				variable: acc.variableName,
				role: 'Usage (access)',
				index: String(acc.accessedIndex),
				kind: acc.accessKind,
			};
		}

		return { value: String(artifact.data) };
	}
}

export default defineRule((options?: CoPStructRuleOptions) => new ConnascenceOfPositionStructRule(options));
