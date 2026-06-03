import { type Artifact, defineRule, type FindingRuleOutput, type Rule } from '@maat-tools/contracts';
import { CONSTANTS_CAPABILITY, type Constant } from '@maat-tools/vocabulary';

export type CoMRuleOptions = {
	threshold?: number;
	ignoreValues?: string[];
};

declare module '@maat-tools/contracts' {
	interface RuleRegistry {
		'@maat-tools/connascence-rules/com': CoMRuleOptions;
	}
}

export class ConnascenceOfMeaningRule implements Rule<'constants'> {
	public readonly id = 'maat-tools/connascence-rules/com@v1';
	public readonly instanceId = this.id;
	public readonly needFacts = [CONSTANTS_CAPABILITY] as const;

	private readonly threshold: number;
	private readonly ignoreValues: Set<string>;

	public constructor(options: CoMRuleOptions = {}) {
		this.threshold = options.threshold ?? 2;
		this.ignoreValues = new Set(options.ignoreValues ?? []);
	}

	public evaluate(facts: { constants: Constant[] }): FindingRuleOutput[] {
		const constants = facts[CONSTANTS_CAPABILITY] ?? [];

		const byValue = new Map<string, Constant[]>();

		for (const constant of constants) {
			if (this.ignoreValues.has(constant.value)) {
				continue;
			}

			const key = `${constant.kind}:${constant.value}`;
			const group = byValue.get(key) ?? [];
			group.push(constant);
			byValue.set(key, group);
		}

		const findings: FindingRuleOutput[] = [];

		for (const [, occurrences] of byValue) {
			const distinctFiles = new Set(occurrences.map((o) => o.location.file));
			if (distinctFiles.size < this.threshold) {
				continue;
			}

			const first = occurrences.at(0);
			if (!first) {
				continue;
			}
			const { value, kind } = first;

			findings.push({
				ruleId: this.id,
				ruleIdentifier: { value, kind },
				message: `"${value}" (${kind}) appears in ${distinctFiles.size} files — possible Connascence of Meaning`,
				artifacts: occurrences.map((c) => ({
					kind: 'source' as const,
					data: c,
				})),
			});
		}

		return findings;
	}

	public describeArtifact(artifact: Artifact): Record<string, string> {
		if (artifact.kind === 'source') {
			const c = artifact.data as Constant;
			const loc = `${c.location.file}:${c.location.line}${c.location.column !== undefined ? `:${c.location.column}` : ''}`;

			return {
				location: loc,
				value: c.value,
			};
		}

		return { value: String(artifact.data) };
	}
}

export default defineRule((options?: CoMRuleOptions) => new ConnascenceOfMeaningRule(options));
