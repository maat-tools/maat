import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { isMatch, LocalCache } from '@maat-tools/utils';
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
import type { TSCollectedFacts, TSInput } from '.';
import { collectAlgorithmicBindings } from './algorithmic-bindings';
import { collectConstants } from './constants';
import { collectDependsOn, toProjectRelativePath } from './dependencies';
import { collectFunctionSignatures } from './functions';
import { collectPositionalAccesses, collectPositionalSources } from './positional';

const cache = new LocalCache({ cachePath: 'collector-ts/ast-facts' });

function hashFileContent(content: string): string {
	return createHash('sha256').update(content).digest('hex');
}

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
	const seenFiles = new Set<string>();
	const constants: Constant[] = [];
	const dependsOn: DependsOn[] = [];
	const functionSignatures: FunctionSignature[] = [];
	const positionalSources: PositionalSource[] = [];
	const positionalAccesses: PositionalAccess[] = [];
	const algorithmicBindings: AlgorithmicBinding[] = [];

	const usedFilesFromCache = new Map<string, Set<string>>();

	const excludePatterns = config.exclude ?? [];
	const algorithmicPatterns = config.algorithmicPatterns ?? [];

	const project = new Project({ tsConfigFilePath: tsConfigPath, skipAddingFilesFromTsConfig: true });
	project.addSourceFilesFromTsConfig(tsConfigPath);

	for (const sourceFile of project.getSourceFiles()) {
		if (sourceFile.isInNodeModules() || sourceFile.isFromExternalLibrary()) {
			continue;
		}

		const absoluteFile = sourceFile.getFilePath();
		if (seenFiles.has(absoluteFile)) {
			continue;
		}
		seenFiles.add(absoluteFile);

		const file = toProjectRelativePath(projectRoot, absoluteFile);
		if (isMatch(file, excludePatterns)) {
			continue;
		}

		if (!requiredFactKeys || requiredFactKeys.has(DEPENDS_ON_CAPABILITY)) {
			const fileDependsOn = await tryToReadFromCache<DependsOn[]>({
				fact: 'depends-on',
				sourceFile,
				tsConfigPath,
				usedFilesFromCache,
				collectorFn: () => collectDependsOn(sourceFile, file),
			});

			dependsOn.push(...fileDependsOn);
		}
		if (!requiredFactKeys || requiredFactKeys.has(CONSTANTS_CAPABILITY)) {
			const fileConstants = await tryToReadFromCache<Constant[]>({
				fact: 'constants',
				sourceFile,
				tsConfigPath,
				usedFilesFromCache,
				collectorFn: () => collectConstants(sourceFile, file),
			});

			constants.push(...fileConstants);
		}
		if (!requiredFactKeys || requiredFactKeys.has(FUNCTION_SIGNATURES_CAPABILITY)) {
			const fileFunctionSignatures = await tryToReadFromCache<FunctionSignature[]>({
				fact: 'function-signatures',
				sourceFile,
				tsConfigPath,
				usedFilesFromCache,
				collectorFn: () => collectFunctionSignatures(sourceFile, file),
			});

			functionSignatures.push(...fileFunctionSignatures);
		}
		if (!requiredFactKeys || requiredFactKeys.has(POSITIONAL_SOURCES_CAPABILITY)) {
			const filePositionalSources = await tryToReadFromCache<PositionalSource[]>({
				tsConfigPath,
				fact: 'positional-sources',
				sourceFile,
				usedFilesFromCache,
				collectorFn: () => collectPositionalSources(sourceFile, file),
			});
			positionalSources.push(...filePositionalSources);
		}
		if (!requiredFactKeys || requiredFactKeys.has(POSITIONAL_ACCESSES_CAPABILITY)) {
			const filePositionalAccesses = await tryToReadFromCache<PositionalAccess[]>({
				sourceFile,
				tsConfigPath,
				fact: 'positional-accesses',
				usedFilesFromCache,
				collectorFn: () => collectPositionalAccesses(sourceFile, file, projectRoot),
			});

			positionalAccesses.push(...filePositionalAccesses);
		}
		if (!requiredFactKeys || requiredFactKeys.has(ALGORITHMIC_BINDINGS_CAPABILITY)) {
			const fileAlgorithmicBindings = await tryToReadFromCache<AlgorithmicBinding[]>({
				sourceFile,
				tsConfigPath,
				fact: 'algorithmic-bindings',
				usedFilesFromCache,
				cacheContext: JSON.stringify(algorithmicPatterns),
				collectorFn: () => collectAlgorithmicBindings(sourceFile, file, algorithmicPatterns),
			});

			algorithmicBindings.push(...fileAlgorithmicBindings);
		}
	}

	await pruneStaleCacheEntries(usedFilesFromCache);

	return {
		algorithmicBindings,
		constants,
		dependsOn,
		functionSignatures,
		positionalAccesses,
		positionalSources,
	};
}

async function tryToReadFromCache<T>({
	sourceFile,
	tsConfigPath,
	fact,
	usedFilesFromCache,
	cacheContext,
	collectorFn,
}: {
	sourceFile: SourceFile;
	tsConfigPath: string;
	fact: string;
	usedFilesFromCache: Map<string, Set<string>>;
	cacheContext?: string;
	collectorFn: () => T;
}): Promise<T> {
	const cacheKey = cacheContext
		? `${sourceFile.getFullText()}-${tsConfigPath}-${fact}-${cacheContext}`
		: `${sourceFile.getFullText()}-${tsConfigPath}-${fact}`;
	const cacheFile = `${hashFileContent(cacheKey)}.json`;

	if (!usedFilesFromCache.has(fact)) {
		usedFilesFromCache.set(fact, new Set());
	}
	usedFilesFromCache.get(fact)?.add(cacheFile);

	const cachedResult = await cache.readCacheEntry<T>(join(fact, cacheFile));

	if (cachedResult) {
		return cachedResult;
	}

	const result = collectorFn();
	await cache.writeCacheEntry(fact, cacheFile, result);

	return result;
}

async function pruneStaleCacheEntries(usedFilesFromCache: Map<string, Set<string>>): Promise<void> {
	const facts = Array.from(usedFilesFromCache.keys());

	for (const fact of facts) {
		const allCacheFilesForFact = await cache.getFileList(fact);
		const usedFilesForFact = usedFilesFromCache.get(fact);
		if (!usedFilesForFact) {
			continue;
		}

		for (const cacheFile of allCacheFilesForFact) {
			if (!usedFilesForFact.has(cacheFile)) {
				await cache.deleteEntry(join(fact, cacheFile));
			}
		}
	}
}
