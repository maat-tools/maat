import { type Artifact, defineRule, type FindingRuleOutput, type Rule } from '@maat-tools/contracts';
import { CONSTANTS_CAPABILITY, type Constant } from '@maat-tools/vocabulary';

declare module '@maat-tools/contracts' {
	interface RuleRegistry {
		'@maat-tools/connascence-rules/com': CoMRuleOptions;
	}
}

// Values that are universally meaningless to track as coupling signals
const NOISE_VALUES = new Set(['', ' ', 'true', 'false', 'null', 'undefined', '0', '1', '2', '-1']);

export type CoMRuleOptions = {
	// Minimum number of occurrences across distinct files to be a finding
	threshold?: number;
	// Additional values to ignore beyond the default noise list
	ignoreValues?: string[];
};

export class ConnascenceOfMeaningRule implements Rule<'constants'> {
	public readonly id = 'com@v1';
	public readonly needFacts = [CONSTANTS_CAPABILITY] as const;

	private readonly threshold: number;
	private readonly ignoreValues: Set<string>;

	public constructor(options: CoMRuleOptions = {}) {
		this.threshold = options.threshold ?? 3;
		this.ignoreValues = new Set([...NOISE_VALUES, ...(options.ignoreValues ?? [])]);
	}

	public evaluate(facts: { constants: Constant[] }): FindingRuleOutput[] {
		const constants = facts[CONSTANTS_CAPABILITY] ?? [];

		// Group constants by value, excluding noise and non-coupling contexts
		const byValue = new Map<string, Constant[]>();

		for (const constant of constants) {
			if (this.ignoreValues.has(constant.value)) {
				continue;
			}
			// Import paths are structural references, not magic values — skip them
			if (constant.context === 'import') {
				continue;
			}

			const group = byValue.get(constant.value) ?? [];
			group.push(constant);
			byValue.set(constant.value, group);
		}

		const findings: FindingRuleOutput[] = [];

		for (const [value, occurrences] of byValue) {
			// Count distinct files
			const files = new Set(occurrences.map((o) => o.location.file));
			if (files.size < this.threshold) {
				continue;
			}

			findings.push({
				ruleId: this.id,
				ruleIdentifier: { value },
				message: `"${value}" appears in ${files.size} files — possible Connascence of Meaning`,
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
				context: c.context,
				value: c.raw,
			};
		}
		return { value: String(artifact.data) };
	}
}

export default defineRule((options?: CoMRuleOptions) => new ConnascenceOfMeaningRule(options));
