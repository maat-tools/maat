import { type Artifact, defineRule, type Rule, type RuleOutput } from '@maat-tools/contracts';
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
	}): RuleOutput[] {
		const { positionalSources, positionalAccesses } = facts;
		const accessMap = new Map<string, PositionalAccess[]>();

		for (const acc of positionalAccesses) {
			const key = acc.origin ? `${acc.origin.file}::${acc.origin.name}` : `${acc.file}::${acc.name}`;
			const existing = accessMap.get(key) ?? [];
			existing.push(acc);
			accessMap.set(key, existing);
		}
		const findings: RuleOutput[] = [];

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
		if (artifact.kind !== 'source' && artifact.kind !== 'access') {
			return { value: String(artifact.data) };
		}
		const data = artifact.data as PositionalSource;
		const loc = `${data.location.file}:${data.location.line}${data.location.column !== undefined ? `:${data.location.column}` : ''}`;

		return {
			role: artifact.kind === 'source' ? '[Source]' : '[Access]',
			location: loc,
			identifier: data.name,
			...(artifact.kind === 'access'
				? {
						kind: (data as unknown as PositionalAccess).accessKind,
						index: String((data as unknown as PositionalAccess).accessedIndex),
					}
				: {
						positions: data.positions.map((p) => `[${p.index}]: ${p.type}`).join(', '),
					}),
		};
	}
}

export default defineRule((options?: CoPStructRuleOptions) => new ConnascenceOfPositionStructRule(options));
