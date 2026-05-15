import { type Artifact, defineRule, type FindingRuleOutput, type Rule } from '@maat-tools/contracts';
import { CONSTANTS_CAPABILITY, type Constant } from '@maat-tools/vocabulary';

// Values that are universally meaningless to track as coupling signals.
// Language-specific keywords (e.g. 'undefined' in JS/TS, 'None' in Python) and common
// numeric literals (e.g. '0', '1', '-1') should be passed via `ignoreValues` at the
// rule configuration level, as their noisiness is domain-dependent.
const UNIVERSAL_NOISE_VALUES = new Set(['', ' ', 'true', 'false', 'null']);

export type CoMRuleOptions = {
	// Minimum number of occurrences across distinct files to be a finding
	threshold?: number;
	// Language-specific or project-specific values to ignore (e.g. ['undefined'] for TS, ['None'] for Python)
	ignoreValues?: string[];
};

declare module '@maat-tools/contracts' {
	interface RuleRegistry {
		'@maat-tools/connascence-rules/com': CoMRuleOptions;
	}
}

export class ConnascenceOfMeaningRule implements Rule<'constants'> {
	public readonly id = 'com@v1';
	public readonly needFacts = [CONSTANTS_CAPABILITY] as const;

	private readonly threshold: number;
	private readonly ignoreValues: Set<string>;

	public constructor(options: CoMRuleOptions = {}) {
		this.threshold = options.threshold ?? 2;
		this.ignoreValues = new Set([...UNIVERSAL_NOISE_VALUES, ...(options.ignoreValues ?? [])]);
	}

	public evaluate(facts: { constants: Constant[] }): FindingRuleOutput[] {
		const constants = facts[CONSTANTS_CAPABILITY] ?? [];

		// Group constants by kind+value, excluding noise and non-coupling contexts.
		// Kind is included in the key so that a string "42" and a number 42 are treated
		// as separate coupling signals.
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
			// Count distinct files
			const files = new Set(occurrences.map((o) => o.location.file));
			if (files.size < this.threshold) {
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
				message: `"${value}" (${kind}) appears in ${files.size} files — possible Connascence of Meaning`,
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
