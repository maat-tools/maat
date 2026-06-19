import { type Artifact, defineRule, type Rule, type RuleOutput } from '@maat-tools/contracts';
import { FUNCTION_SIGNATURES_CAPABILITY, type FunctionSignature } from '@maat-tools/vocabulary';

export type CoPArgsRuleOptions = {
	flagBoolean?: boolean;
	maxArgumentsAllowed?: number;
	onlyExported?: boolean;
};

declare module '@maat-tools/contracts' {
	interface RuleRegistry {
		'@maat-tools/connascence-rules/cop-args': CoPArgsRuleOptions;
	}
}

export class ConnascenceOfPositionArgsRule implements Rule<'functionSignatures'> {
	public readonly id = 'maat-tools/connascence-rules/cop-args@v1';
	public readonly instanceId = this.id;
	public readonly needFacts = [FUNCTION_SIGNATURES_CAPABILITY] as const;

	private readonly flagBoolean: boolean;
	private readonly maxArgumentsAllowed: number;
	private readonly onlyExported: boolean;

	public constructor(options: CoPArgsRuleOptions = {}) {
		this.flagBoolean = options.flagBoolean ?? true;
		this.maxArgumentsAllowed = options.maxArgumentsAllowed ?? 3;
		this.onlyExported = options.onlyExported ?? true;
	}

	public evaluate(facts: { functionSignatures: FunctionSignature[] }): { findings: RuleOutput[] } {
		const signatures = facts[FUNCTION_SIGNATURES_CAPABILITY] ?? [];

		const findings: RuleOutput[] = [];

		for (const sig of signatures) {
			if (this.onlyExported && !sig.exported) {
				continue;
			}

			const reasons: string[] = [];

			if (this.flagBoolean && sig.input.parameters.some((p) => p.type === 'boolean')) {
				reasons.push(
					'contains boolean param. (Consider remove the boolean flag or replace it with a more descriptive parameter)',
				);
			}

			if (sig.input.parameters.length > this.maxArgumentsAllowed) {
				reasons.push(
					`${sig.input.parameters.length} params exceeds threshold of ${this.maxArgumentsAllowed}. (Consider refactoring to reduce the number of parameters, e.g., by grouping related parameters into a data structure)`,
				);
			}

			if (reasons.length === 0) {
				continue;
			}

			const paramSummary = sig.input.parameters.map((p) => `${p.name}: ${p.type}`).join(', ');

			findings.push({
				ruleId: this.id,
				ruleIdentifier: { function: sig.name, params: paramSummary },
				message: `"${sig.name}" — ${reasons.join('; ')}`,
				artifacts: [
					{
						kind: 'source' as const,
						data: sig,
					},
				],
			});
		}

		return { findings };
	}

	public describeArtifact(artifact: Artifact): Record<string, string> {
		if (artifact.kind === 'source') {
			const sig = artifact.data as FunctionSignature;
			const loc = `${sig.location.file}:${sig.location.line}${sig.location.column !== undefined ? `:${sig.location.column}` : ''}`;
			const paramList = sig.input.parameters.map((p) => `${p.name}: ${p.type}`).join(', ');

			return {
				location: loc,
				function: sig.name,
				parameters: paramList,
			};
		}

		return { value: String(artifact.data) };
	}
}

export default defineRule((options?: CoPArgsRuleOptions) => new ConnascenceOfPositionArgsRule(options));
