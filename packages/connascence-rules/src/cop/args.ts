import { type Artifact, defineRule, type FindingRuleOutput, type Rule } from '@maat-tools/contracts';
import {
	CALL_GRAPH_CAPABILITY,
	type CallEdge,
	type CallGraph,
	FUNCTION_SIGNATURES_CAPABILITY,
	type FunctionSignature,
} from '@maat-tools/vocabulary';

export type CoPArgsRuleOptions = {
	flagBoolean?: boolean;
	maxArgumentsAllowed?: number;
	onlyExported?: boolean;
};

type CallerInfo = {
	callerFile: string;
	callerId: string;
};

declare module '@maat-tools/contracts' {
	interface RuleRegistry {
		'@maat-tools/connascence-rules/cop-args': CoPArgsRuleOptions;
	}
}

export class ConnascenceOfPositionArgsRule implements Rule<'functionSignatures' | 'callGraph'> {
	public readonly id = 'cop-args@v1';
	public readonly needFacts = [FUNCTION_SIGNATURES_CAPABILITY, CALL_GRAPH_CAPABILITY] as const;

	private readonly flagBoolean: boolean;
	private readonly maxArgumentsAllowed: number;
	private readonly onlyExported: boolean;

	public constructor(options: CoPArgsRuleOptions = {}) {
		this.flagBoolean = options.flagBoolean ?? true;
		this.maxArgumentsAllowed = options.maxArgumentsAllowed ?? 3;
		this.onlyExported = options.onlyExported ?? true;
	}

	private buildCallersMap(callGraph: CallEdge[]): Map<string, CallerInfo[]> {
		const callers = new Map<string, CallerInfo[]>();

		for (const edge of callGraph) {
			const calleeFile = edge.calleeId.split(':')[0];
			if (!calleeFile) {
				continue;
			}

			const info: CallerInfo = {
				callerFile: edge.location.file,
				callerId: edge.callerId,
			};

			const existing = callers.get(calleeFile) ?? [];
			existing.push(info);
			callers.set(calleeFile, existing);
		}

		return callers;
	}

	private findCallChainDepth(file: string, callers: Map<string, CallerInfo[]>): number {
		const visited = new Set<string>();
		const queue: Array<{ file: string; depth: number }> = [{ file, depth: 0 }];
		let maxDepth = 0;

		while (queue.length > 0) {
			const current = queue.shift();
			if (!current) {
				break;
			}
			if (visited.has(current.file)) {
				continue;
			}
			visited.add(current.file);

			maxDepth = Math.max(maxDepth, current.depth);

			const fileCallers = callers.get(current.file);
			if (fileCallers) {
				for (const caller of fileCallers) {
					if (!visited.has(caller.callerFile)) {
						queue.push({ file: caller.callerFile, depth: current.depth + 1 });
					}
				}
			}
		}

		return maxDepth;
	}

	public evaluate(facts: { functionSignatures: FunctionSignature[]; callGraph: CallGraph }): FindingRuleOutput[] {
		const signatures = facts[FUNCTION_SIGNATURES_CAPABILITY] ?? [];
		const callGraph = facts[CALL_GRAPH_CAPABILITY] ?? { nodes: [], edges: [] };

		const callersMap = this.buildCallersMap(callGraph.edges);

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

			const callers = callersMap.get(sig.file) ?? [];
			const crossFileCallers = callers.filter(
				(c) => !c.callerFile.endsWith(sig.file) && !sig.file.endsWith(c.callerFile),
			);
			const callChainDepth = this.findCallChainDepth(sig.file, callersMap);

			const callerSummary =
				crossFileCallers.length > 0
					? ` — called from ${crossFileCallers.length} file(s), max chain depth: ${callChainDepth}`
					: '';

			const paramSummary = sig.parameters.map((p) => `${p.name}: ${p.type}`).join(', ');

			findings.push({
				ruleId: this.id,
				ruleIdentifier: { function: sig.functionName, params: paramSummary },
				message: `"${sig.functionName}" — ${reasons.join('; ')}${callerSummary}`,
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

export default defineRule((options?: CoPArgsRuleOptions) => new ConnascenceOfPositionArgsRule(options));
