import { type Artifact, defineRule, type FindingRuleOutput, type Rule } from '@maat-tools/contracts';
import { FUNCTION_SIGNATURES_CAPABILITY, type FunctionSignature } from '@maat-tools/vocabulary';

export type CoPRuleOptions = {
	// Flag any function with at least one boolean param
	flagBoolean?: boolean;
	// Flag any function exceeding N arguments
	maxArgumentsAllowed?: number;
	// Only flag exported/public functions (default: true)
	onlyExported?: boolean;
};

declare module '@maat-tools/contracts' {
	interface RuleRegistry {
		'@maat-tools/connascence-rules/cop': CoPRuleOptions;
	}
}

export class ConnascenceOfPositionRule implements Rule<'functionSignatures'> {
	public readonly id = 'cop@v1';
	public readonly needFacts = [FUNCTION_SIGNATURES_CAPABILITY] as const;

	private readonly flagBoolean: boolean;
	private readonly maxArgumentsAllowed: number;
	private readonly onlyExported: boolean;

	public constructor(options: CoPRuleOptions = {}) {
		this.flagBoolean = options.flagBoolean ?? true;
		this.maxArgumentsAllowed = options.maxArgumentsAllowed ?? 3;
		this.onlyExported = options.onlyExported ?? true;
	}

	public evaluate(facts: { functionSignatures: FunctionSignature[] }): FindingRuleOutput[] {
		const signatures = facts[FUNCTION_SIGNATURES_CAPABILITY] ?? [];
		const findings: FindingRuleOutput[] = [];

		for (const sig of signatures) {
			if (this.onlyExported && !sig.isExported) {
				continue;
			}

			const reasons: string[] = [];

			if (this.flagBoolean && sig.parameters.some((p) => p.type === 'boolean')) {
				reasons.push('contains boolean param');
			}

			if (sig.parameters.length > this.maxArgumentsAllowed) {
				reasons.push(`${sig.parameters.length} params exceeds threshold of ${this.maxArgumentsAllowed}`);
			}

			if (reasons.length === 0) {
				continue;
			}

			const paramSummary = sig.parameters.map((p) => `${p.name}: ${p.type}`).join(', ');

			findings.push({
				ruleId: this.id,
				ruleIdentifier: { function: sig.functionName, params: paramSummary },
				message: `"${sig.functionName}" — ${reasons.join('; ')}`,
				artifacts: [
					{
						kind: 'source' as const,
						data: sig,
					},
				],
			});
		}

		return findings;
	}

	public describeArtifact(artifact: Artifact): Record<string, string> {
		if (artifact.kind === 'source') {
			const sig = artifact.data as FunctionSignature;
			const loc = `${sig.location.file}:${sig.location.line}${sig.location.column !== undefined ? `:${sig.location.column}` : ''}`;
			const paramList = sig.parameters.map((p) => `${p.name}: ${p.type}`).join(', ');

			return {
				location: loc,
				function: sig.functionName,
				parameters: paramList,
			};
		}

		return { value: String(artifact.data) };
	}
}

export default defineRule((options?: CoPRuleOptions) => new ConnascenceOfPositionRule(options));
