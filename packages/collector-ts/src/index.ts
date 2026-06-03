import { type Collector, defineCollector, type FactRegistry } from '@maat-tools/contracts';
import { getCurrentDir, isMatch, resolveSymbol } from '@maat-tools/utils';
import {
	ALGORITHMIC_BINDINGS_CAPABILITY,
	type AlgorithmicBinding,
	type AlgorithmicPattern,
	CALL_GRAPH_CAPABILITY,
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

	private async expandGlobs(patterns: string[], rootDir: string): Promise<string[]> {
		const results: string[] = [];
		for (const pattern of patterns) {
			if (/[*?{[]/.test(pattern)) {
				const matches = await glob(pattern, { cwd: rootDir, absolute: true });
				results.push(...matches);
			} else {
				results.push(resolveSymbol(pattern));
			}
		}

		return results;
	}

	public async collect(): Promise<
		Pick<
			FactRegistry,
			| 'dependsOn'
			| 'constants'
			| 'functionSignatures'
			| 'positionalSources'
			| 'positionalAccesses'
			| 'algorithmicBindings'
			| 'callGraph'
		>
	> {
		const rawPatterns = Array.isArray(this.config.tsConfigFilePath)
			? this.config.tsConfigFilePath
			: [this.config.tsConfigFilePath];

		const projectRoot = getCurrentDir();
		const tsConfigPaths = await this.expandGlobs(rawPatterns, projectRoot);

		const excludePatterns = this.config.exclude ?? [];
		const algorithmicPatterns = this.config.algorithmicPatterns ?? [];
		const seenFiles = new Set<string>();
		const constants: Constant[] = [];
		const dependsOn: DependsOn[] = [];
		const functionSignatures: FunctionSignature[] = [];
		const positionalSources: PositionalSource[] = [];
		const positionalAccesses: PositionalAccess[] = [];
		const algorithmicBindings: AlgorithmicBinding[] = [];
		const includedFiles: string[] = [];

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

				dependsOn.push(...collectDependsOn(sourceFile, file));
				constants.push(...collectConstants(sourceFile, file));
				functionSignatures.push(...collectFunctionSignatures(sourceFile, file));
				positionalSources.push(...collectPositionalSources(sourceFile, file));
				positionalAccesses.push(...collectPositionalAccesses(sourceFile, file, projectRoot));
				algorithmicBindings.push(...collectAlgorithmicBindings(sourceFile, file, algorithmicPatterns));
			}
		}

		const callGraph = await collectCallGraph(includedFiles, projectRoot, this.config.callGraph ?? {});

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
}

declare module '@maat-tools/contracts' {
	interface CollectorRegistry {
		'@maat-tools/collector-ts': TSInput;
	}
}

export default defineCollector((config: TSInput) => new TSCollector(config));
