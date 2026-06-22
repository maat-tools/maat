import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { isMatch, LocalCache, readFileContent } from '@maat-tools/utils';
import {
	ALGORITHMIC_BINDINGS_CAPABILITY,
	type AlgorithmicBinding,
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
import { Project, type SourceFile } from 'ts-morph';
import ts from 'typescript';
import type { TSCollectedFacts, TSInput } from '.';
import { collectAlgorithmicBindings } from './algorithmic-bindings';
import { collectConstants } from './constants';
import { collectDependsOn, toProjectRelativePath } from './dependencies';
import { collectFunctionSignatures } from './functions';
import { collectPositionalAccesses, collectPositionalSources } from './positional';

const BATCH_SIZE = 10;

export async function collectASTFacts({
	tsConfigPath,
	config,
	projectRoot,
	requiredFactKeys,
}: {
	tsConfigPath: string;
	config: TSInput;
	projectRoot: string;
	requiredFactKeys?: Set<keyof TSCollectedFacts>;
}): Promise<{
	algorithmicBindings: AlgorithmicBinding[];
	constants: Constant[];
	dependsOn: DependsOn[];
	functionSignatures: FunctionSignature[];
	positionalSources: PositionalSource[];
	positionalAccesses: PositionalAccess[];
}> {
	const excludePatterns = config.exclude ?? [];
	const algorithmicPatterns = config.algorithmicPatterns ?? [];

	const cache = new LocalCache({ cachePath: `collector-ts/ast-facts/${hashFileContent(tsConfigPath)}` });

	const availableFacts = new Map<
		string,
		{
			collector: <T>(sourceFile: SourceFile, filepath: string) => T[];
			accumulator: unknown[];
			cacheContext?: unknown;
		}
	>([
		[
			DEPENDS_ON_CAPABILITY,
			{
				collector: <T>(sourceFile: SourceFile, filepath: string) =>
					collectDependsOn(sourceFile, filepath) as unknown as T[],
				accumulator: [],
			},
		],
		[
			CONSTANTS_CAPABILITY,
			{
				collector: <T>(sourceFile: SourceFile, filepath: string) =>
					collectConstants(sourceFile, filepath) as unknown as T[],
				accumulator: [],
			},
		],
		[
			FUNCTION_SIGNATURES_CAPABILITY,
			{
				collector: <T>(sourceFile: SourceFile, filepath: string) =>
					collectFunctionSignatures(sourceFile, filepath) as unknown as T[],
				accumulator: [],
			},
		],
		[
			POSITIONAL_SOURCES_CAPABILITY,
			{
				collector: <T>(sourceFile: SourceFile, filepath: string) =>
					collectPositionalSources(sourceFile, filepath) as unknown as T[],
				accumulator: [],
			},
		],
		[
			POSITIONAL_ACCESSES_CAPABILITY,
			{
				collector: <T>(sourceFile: SourceFile, filepath: string) =>
					collectPositionalAccesses(sourceFile, filepath, projectRoot) as unknown as T[],
				accumulator: [],
			},
		],
		[
			ALGORITHMIC_BINDINGS_CAPABILITY,
			{
				cacheContext: algorithmicPatterns,
				collector: <T>(sourceFile: SourceFile, filepath: string) =>
					collectAlgorithmicBindings(sourceFile, filepath, algorithmicPatterns) as unknown as T[],
				accumulator: [],
			},
		],
	]);

	const factsToCollect = Array.from(availableFacts.keys()).filter(
		(fact) => !requiredFactKeys || requiredFactKeys.has(fact as keyof TSCollectedFacts),
	);

	const cachedFilesByFactName = await getAllCachedFilesForFacts(cache, factsToCollect);
	const fileLoadMapping = new Map<string, { factName: string; filenameForCaching: string }[]>();
	const allFilesFromCacheForFact = new Map<string, Set<string>>();

	for await (const { filepath, fileContent } of getFileContentFromTSConfigInBatch(tsConfigPath, BATCH_SIZE)) {
		const file = toProjectRelativePath(projectRoot, filepath);
		if (isMatch(file, excludePatterns)) {
			continue;
		}

		for (const factName of factsToCollect) {
			const fact = availableFacts.get(factName);
			if (!fact) {
				continue;
			}
			const cacheContext = fact.cacheContext ? JSON.stringify(fact.cacheContext) : undefined;
			const filename = `${hashFileContent(calculateCacheKey(fileContent, tsConfigPath, factName, cacheContext))}.json`;

			if (!allFilesFromCacheForFact.has(factName)) {
				allFilesFromCacheForFact.set(factName, new Set());
			}
			allFilesFromCacheForFact.get(factName)?.add(filename);

			const cacheHit = cachedFilesByFactName.get(factName)?.has(filename) ?? false;
			if (cacheHit) {
				const cacheEntry = await cache.readCacheEntry<unknown[]>(join(factName, filename));
				if (cacheEntry) {
					fact.accumulator.push(...cacheEntry);
				}
				continue;
			}

			const entries = fileLoadMapping.get(filepath) ?? [];
			entries.push({ factName, filenameForCaching: filename });
			fileLoadMapping.set(filepath, entries);
		}
	}

	const project = new Project({ tsConfigFilePath: tsConfigPath, skipAddingFilesFromTsConfig: true });
	for (const [filepath, entries] of fileLoadMapping.entries()) {
		const sourceFile = project.addSourceFileAtPath(filepath);
		if (sourceFile.isInNodeModules() || sourceFile.isFromExternalLibrary()) {
			continue;
		}

		const file = toProjectRelativePath(projectRoot, filepath);

		for (const { factName, filenameForCaching } of entries) {
			const fact = availableFacts.get(factName);
			if (!fact) {
				continue;
			}

			const result = fact.collector(sourceFile, file);
			fact.accumulator.push(...result);

			await cache.writeCacheEntry(factName, filenameForCaching, result);
		}
	}

	await pruneStaleCacheEntries(cache, allFilesFromCacheForFact, factsToCollect);

	return {
		algorithmicBindings:
			(availableFacts.get(ALGORITHMIC_BINDINGS_CAPABILITY)?.accumulator as AlgorithmicBinding[]) ?? [],
		constants: (availableFacts.get(CONSTANTS_CAPABILITY)?.accumulator as Constant[]) ?? [],
		dependsOn: (availableFacts.get(DEPENDS_ON_CAPABILITY)?.accumulator as DependsOn[]) ?? [],
		functionSignatures: (availableFacts.get(FUNCTION_SIGNATURES_CAPABILITY)?.accumulator as FunctionSignature[]) ?? [],
		positionalAccesses: (availableFacts.get(POSITIONAL_ACCESSES_CAPABILITY)?.accumulator as PositionalAccess[]) ?? [],
		positionalSources: (availableFacts.get(POSITIONAL_SOURCES_CAPABILITY)?.accumulator as PositionalSource[]) ?? [],
	};
}

async function getAllCachedFilesForFacts(cache: LocalCache, facts: string[]): Promise<Map<string, Set<string>>> {
	const cachedFilesByFactName = new Map<string, Set<string>>();
	for (const fact of facts) {
		cachedFilesByFactName.set(fact, new Set(await cache.getFileList(fact)));
	}

	return cachedFilesByFactName;
}

function hashFileContent(content: string): string {
	return createHash('sha256').update(content).digest('hex');
}

async function* getFileContentFromTSConfigInBatch(tsConfigPath: string, batchSize = 10) {
	const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
	const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(tsConfigPath));
	const filesFromTsConfig = parsedConfig.fileNames;

	for (let i = 0; i < filesFromTsConfig.length; i += batchSize) {
		const batch = filesFromTsConfig.slice(i, i + batchSize);
		const results = await Promise.all(
			batch.map(async (filepath) => ({
				filepath,
				fileContent: await readFileContent(filepath),
			})),
		);
		yield* results;
	}
}

function calculateCacheKey(fileContent: string, tsConfigPath: string, fact: string, cacheContext?: string): string {
	const cacheKey = cacheContext
		? `${fileContent}-${tsConfigPath}-${fact}-${cacheContext}`
		: `${fileContent}-${tsConfigPath}-${fact}`;

	return hashFileContent(cacheKey);
}

async function pruneStaleCacheEntries(
	cache: LocalCache,
	allFilesFromCacheForFact: Map<string, Set<string>>,
	collectedFacts: string[],
): Promise<void> {
	for (const fact of collectedFacts) {
		const allCacheFilesForFact = await cache.getFileList(fact);

		for (const cacheFile of allCacheFilesForFact) {
			if (!allFilesFromCacheForFact.get(fact)?.has(cacheFile)) {
				await cache.deleteEntry(join(fact, cacheFile));
			}
		}
	}
}
