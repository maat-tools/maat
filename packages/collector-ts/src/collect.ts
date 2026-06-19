import { resolve } from 'node:path';
import type { FactRegistry } from '@maat-tools/contracts';
import { isMatch, resolveProjectRoot } from '@maat-tools/utils';
import {
	ALGORITHMIC_BINDINGS_CAPABILITY,
	type AlgorithmicBinding,
	type AlgorithmicPattern,
	CALL_GRAPH_CAPABILITY,
	type CallGraph,
	CONSTANTS_CAPABILITY,
	type Constant,
	DEPENDS_ON_CAPABILITY,
	type DependsOn,
	FUNCTION_SIGNATURES_CAPABILITY,
	type FunctionSignature,
	POSITIONAL_ACCESSES_CAPABILITY,
	POSITIONAL_SOURCES_CAPABILITY,
	type PositionalAccess,
	type PositionalSource,
} from '@maat-tools/vocabulary';
import { glob } from 'tinyglobby';
import { Project } from 'ts-morph';
import { collectAlgorithmicBindings } from './algorithmic-bindings';
import { collectCallGraph } from './call-graph';
import { collectConstants } from './constants';
import { collectDependsOn, toProjectRelativePath } from './dependencies';
import { collectFunctionSignatures } from './functions';
import { collectPositionalAccesses, collectPositionalSources } from './positional';

export type TSInput = {
	tsConfigFilePath: string | string[];
	exclude?: string[];
	algorithmicPatterns?: AlgorithmicPattern[];
	callGraph?: {
		maxIndirections?: number;
		timeout?: number;
	};
};

export type TSCollectedFacts = Pick<
	FactRegistry,
	| 'dependsOn'
	| 'constants'
	| 'functionSignatures'
	| 'positionalSources'
	| 'positionalAccesses'
	| 'algorithmicBindings'
	| 'callGraph'
>;

async function expandGlobs(patterns: string[], rootDir: string): Promise<string[]> {
	const results: string[] = [];
	for (const pattern of patterns) {
		if (/[*?{[]/.test(pattern)) {
			const matches = await glob(pattern, { cwd: rootDir, absolute: true });
			results.push(...matches);
		} else {
			results.push(resolve(rootDir, pattern));
		}
	}

	return results;
}

export async function runCollect({
	config,
	requiredFactKeys,
}: {
	config: TSInput;
	requiredFactKeys?: Set<keyof TSCollectedFacts>;
}): Promise<TSCollectedFacts> {
	const rawPatterns = Array.isArray(config.tsConfigFilePath) ? config.tsConfigFilePath : [config.tsConfigFilePath];
	const projectRoot = resolveProjectRoot();
	const tsConfigPaths = await expandGlobs(rawPatterns, projectRoot);

	const excludePatterns = config.exclude ?? [];
	const algorithmicPatterns = config.algorithmicPatterns ?? [];
	const seenFiles = new Set<string>();
	const constants: Constant[] = [];
	const dependsOn: DependsOn[] = [];
	const functionSignatures: FunctionSignature[] = [];
	const positionalSources: PositionalSource[] = [];
	const positionalAccesses: PositionalAccess[] = [];
	const algorithmicBindings: AlgorithmicBinding[] = [];
	const includedFiles: string[] = [];
	let callGraph: CallGraph = { nodes: [], edges: [] };

	for (const tsConfigPath of tsConfigPaths) {
		const project = new Project({ tsConfigFilePath: tsConfigPath });

		for (const sourceFile of project.getSourceFiles()) {
			const absoluteFile = sourceFile.getFilePath();
			if (seenFiles.has(absoluteFile)) {
				continue;
			}
			seenFiles.add(absoluteFile);

			const file = toProjectRelativePath(projectRoot, absoluteFile);
			if (isMatch(file, excludePatterns)) {
				continue;
			}

			includedFiles.push(absoluteFile);

			if (!requiredFactKeys || requiredFactKeys.has(DEPENDS_ON_CAPABILITY)) {
				dependsOn.push(...collectDependsOn(sourceFile, file));
			}
			if (!requiredFactKeys || requiredFactKeys.has(CONSTANTS_CAPABILITY)) {
				constants.push(...collectConstants(sourceFile, file));
			}
			if (!requiredFactKeys || requiredFactKeys.has(FUNCTION_SIGNATURES_CAPABILITY)) {
				functionSignatures.push(...collectFunctionSignatures(sourceFile, file));
			}
			if (!requiredFactKeys || requiredFactKeys.has(POSITIONAL_SOURCES_CAPABILITY)) {
				positionalSources.push(...collectPositionalSources(sourceFile, file));
			}
			if (!requiredFactKeys || requiredFactKeys.has(POSITIONAL_ACCESSES_CAPABILITY)) {
				positionalAccesses.push(...collectPositionalAccesses(sourceFile, file, projectRoot));
			}
			if (!requiredFactKeys || requiredFactKeys.has(ALGORITHMIC_BINDINGS_CAPABILITY)) {
				algorithmicBindings.push(...collectAlgorithmicBindings(sourceFile, file, algorithmicPatterns));
			}
		}
	}

	if (!requiredFactKeys || requiredFactKeys.has(CALL_GRAPH_CAPABILITY)) {
		callGraph = await collectCallGraphSafely(includedFiles, projectRoot, config.callGraph ?? {});
	}

	return {
		dependsOn,
		constants,
		functionSignatures,
		positionalSources,
		positionalAccesses,
		algorithmicBindings,
		callGraph,
	};
}

async function collectCallGraphSafely(
	entryFiles: string[],
	projectRoot: string,
	options: { maxIndirections?: number; timeout?: number },
): Promise<CallGraph> {
	try {
		return await collectCallGraph(entryFiles, projectRoot, options);
	} catch {
		return { nodes: [], edges: [] };
	}
}
