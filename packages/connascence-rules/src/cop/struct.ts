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

	public evaluate(facts: { positionalSources: PositionalSource[]; positionalAccesses: PositionalAccess[] }): FindingRuleOutput[] {
		return [];
	}

	public describeArtifact(artifact: Artifact): Record<string, string> {
		return { value: String(artifact.data) };
	}
}

export default defineRule((options?: CoPStructRuleOptions) => new ConnascenceOfPositionStructRule(options));
