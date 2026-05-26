import { type Artifact, defineRule, type FindingRuleOutput, type Rule } from '@maat-tools/contracts';
import {
	CALL_GRAPH_CAPABILITY,
	type CallEdge,
	type CallGraph,
	CONSTANTS_CAPABILITY,
	type Constant,
} from '@maat-tools/vocabulary';

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

type FlowPath = {
	sourceFile: string;
	targetFile: string;
	edges: CallEdge[];
};

declare module '@maat-tools/contracts' {
	interface RuleRegistry {
		'@maat-tools/connascence-rules/com': CoMRuleOptions;
	}
}

export class ConnascenceOfMeaningRule implements Rule<'constants' | 'callGraph'> {
	public readonly id = 'com@v1';
	public readonly needFacts = [CONSTANTS_CAPABILITY, CALL_GRAPH_CAPABILITY] as const;

	private readonly threshold: number;
	private readonly ignoreValues: Set<string>;

	public constructor(options: CoMRuleOptions = {}) {
		this.threshold = options.threshold ?? 2;
		this.ignoreValues = new Set([...UNIVERSAL_NOISE_VALUES, ...(options.ignoreValues ?? [])]);
	}

	private buildCallGraphAdjacency(callGraph: CallGraph): Map<string, Set<string>> {
		const adjacency = new Map<string, Set<string>>();

		for (const edge of callGraph.edges) {
			const callerFile = edge.location.file;
			const calleeFile = edge.calleeId.split(':')[0];
			if (!calleeFile) {
				continue;
			}

			if (!adjacency.has(callerFile)) {
				adjacency.set(callerFile, new Set());
			}
			const callers = adjacency.get(callerFile);
			if (callers) {
				callers.add(calleeFile);
			}
		}

		return adjacency;
	}

	private findFlowPath(sourceFile: string, targetFile: string, adjacency: Map<string, Set<string>>): FlowPath | null {
		const visited = new Set<string>();
		const queue: Array<{ file: string; path: CallEdge[] }> = [{ file: sourceFile, path: [] }];

		while (queue.length > 0) {
			const current = queue.shift();
			if (!current) {
				break;
			}
			if (visited.has(current.file)) {
				continue;
			}
			visited.add(current.file);

			if (current.file === targetFile) {
				return { sourceFile, targetFile, edges: current.path };
			}

			const neighbors = adjacency.get(current.file);
			if (neighbors) {
				for (const neighbor of neighbors) {
					if (!visited.has(neighbor)) {
						const edge = {
							callerId: `${current.file}:0`,
							calleeId: `${neighbor}:0`,
							location: { file: neighbor, line: 0 },
						};
						queue.push({ file: neighbor, path: [...current.path, edge] });
					}
				}
			}
		}

		return null;
	}

	public evaluate(facts: { constants: Constant[]; callGraph: CallGraph }): FindingRuleOutput[] {
		const constants = facts[CONSTANTS_CAPABILITY] ?? [];
		const callGraph = facts[CALL_GRAPH_CAPABILITY] ?? { nodes: [], edges: [] };

		const adjacency = this.buildCallGraphAdjacency(callGraph);

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

			const fileArray = Array.from(files);
			const flowPaths: FlowPath[] = [];

			for (let i = 0; i < fileArray.length; i++) {
				const sourceFile = fileArray[i];
				if (!sourceFile) {
					continue;
				}
				for (let j = i + 1; j < fileArray.length; j++) {
					const targetFile = fileArray[j];
					if (!targetFile) {
						continue;
					}
					const path = this.findFlowPath(sourceFile, targetFile, adjacency);
					if (path) {
						flowPaths.push(path);
					}
				}
			}

			const first = occurrences.at(0);
			if (!first) {
				continue;
			}
			const { value, kind } = first;

			const flowSummary =
				flowPaths.length > 0
					? ` — flow paths: ${flowPaths.map((p) => `${p.sourceFile} → ${p.targetFile} (${p.edges.length} hops)`).join(', ')}`
					: '';

			findings.push({
				ruleId: this.id,
				ruleIdentifier: { value, kind },
				message: `"${value}" (${kind}) appears in ${files.size} files — possible Connascence of Meaning${flowSummary}`,
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
