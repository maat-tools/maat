import { fileURLToPath } from 'node:url';
import { type Collector, defineCollector, type FactRegistry } from '@maat-tools/contracts';
import {
	ALGORITHMIC_BINDINGS_CAPABILITY,
	CALL_GRAPH_CAPABILITY,
	CONSTANTS_CAPABILITY,
	DEPENDS_ON_CAPABILITY,
	FUNCTION_SIGNATURES_CAPABILITY,
	POSITIONAL_ACCESSES_CAPABILITY,
	POSITIONAL_SOURCES_CAPABILITY,
	type AlgorithmicBinding,
	type AlgorithmicPattern,
	type CallGraph,
	type Constant,
	type DependsOn,
	type FunctionSignature,
	type PositionalAccess,
	type PositionalSource,
} from '@maat-tools/vocabulary';
import { ThreadRunner } from '../../utils/src/threads/thread-runner';
import { resolveProjectRoot } from '../../utils/src/file-system/file-system';
import { glob } from 'tinyglobby';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { collectCallGraph } from './call-graph';

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

export type TSInput = {
	tsConfigFilePath: string | string[];
	exclude?: string[];
	algorithmicPatterns?: AlgorithmicPattern[];
	callGraph?: {
		maxIndirections?: number;
		timeout?: number;
	};
};


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

export class TSCollector
	implements
		Collector<
			| 'dependsOn'
			| 'constants'
			| 'functionSignatures'
			| 'positionalSources'
			| 'positionalAccesses'
			| 'algorithmicBindings'
			| 'callGraph'
		>
{
	public readonly id = 'maat-tools/collector-ts' as const;
	public readonly provideFacts = [
		CONSTANTS_CAPABILITY,
		DEPENDS_ON_CAPABILITY,
		FUNCTION_SIGNATURES_CAPABILITY,
		POSITIONAL_SOURCES_CAPABILITY,
		POSITIONAL_ACCESSES_CAPABILITY,
		ALGORITHMIC_BINDINGS_CAPABILITY,
		CALL_GRAPH_CAPABILITY,
	] as const;

	public constructor(private readonly config: TSInput) {}

	public async collect({
		requiredFactKeys,
	}: {
		requiredFactKeys?: Set<keyof TSCollectedFacts>;
	} = {}): Promise<TSCollectedFacts> {
		const rawPatterns = Array.isArray(this.config.tsConfigFilePath) ? this.config.tsConfigFilePath : [this.config.tsConfigFilePath];
			const projectRoot = resolveProjectRoot();
			const tsConfigPaths = await expandGlobs(rawPatterns, projectRoot);
			const includedFiles: string[] = tsConfigPaths.map((tsConfigPath) => this.getFilepathsForTSConfig(tsConfigPath)).flat();
		
			const worker = new ThreadRunner('@maat-tools/collector-ts/ast-worker');
			
			const [callGraph, astFacts] = await Promise.all([
				this.collectCallGraphSafely({ entryFiles: includedFiles, projectRoot, options: this.config.callGraph ?? {}, requiredFactKeys }),
				Promise.all(tsConfigPaths.map((tsConfigPath) => worker.run<{ tsConfigPath: string; config: TSInput; projectRoot: string; requiredFactKeys?: Set<keyof TSCollectedFacts> }, TSCollectedFacts>({
					tsConfigPath,
					config: this.config,
					projectRoot,
					requiredFactKeys
				}))),
			]);
		
			const mergedASTFacts = astFacts.reduce((merged, current) => {
				merged.constants.push(...current.constants);
				merged.dependsOn.push(...current.dependsOn);
				merged.functionSignatures.push(...current.functionSignatures);
				merged.positionalAccesses.push(...current.positionalAccesses);
				merged.positionalSources.push(...current.positionalSources);
				merged.algorithmicBindings.push(...current.algorithmicBindings);
		
				return merged;
			}, {
				constants: [] as Constant[],
				dependsOn: [] as DependsOn[],
				functionSignatures: [] as FunctionSignature[],
				positionalAccesses: [] as PositionalAccess[],
				positionalSources: [] as PositionalSource[],
				algorithmicBindings: [] as AlgorithmicBinding[],
			});
		
			return {
				...mergedASTFacts,
				callGraph,
			};
	}

	private async collectCallGraphSafely({
		entryFiles,
		options,
		projectRoot,
		requiredFactKeys,
	}: {
		entryFiles: string[],
		projectRoot: string,
		options: { maxIndirections?: number; timeout?: number },
		requiredFactKeys?: Set<string>,
	}): Promise<CallGraph> {
		if (!requiredFactKeys || !requiredFactKeys.has(CALL_GRAPH_CAPABILITY)) {
			return { nodes: [], edges: [] };
		}
	
		try {
			return await collectCallGraph(entryFiles, projectRoot, options);
		} catch {
			return { nodes: [], edges: [] };
		}
	}
	

	private getFilepathsForTSConfig(tsConfigPath: string): string[] {
		const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
		const parsed = ts.parseJsonConfigFileContent(
			configFile.config,
			ts.sys,
			dirname(tsConfigPath),
		);
	
		return parsed.fileNames.filter((file) => !file.includes('node_modules') && !file.includes('dist'));
	}
}

declare module '@maat-tools/contracts' {
	interface CollectorRegistry {
		'@maat-tools/collector-ts': TSInput;
	}
}

export default defineCollector((config: TSInput) => new TSCollector(config));
