import { isMatch } from '@maat-tools/utils';
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
import { Project } from 'ts-morph';
import { collectAlgorithmicBindings } from './algorithmic-bindings';
import { collectConstants } from './constants';
import { collectDependsOn, toProjectRelativePath } from './dependencies';
import { collectFunctionSignatures } from './functions';
import { collectPositionalAccesses, collectPositionalSources } from './positional';
import type { TSCollectedFacts, TSInput } from '.';

export function collectASTFacts({
	tsConfigPath,
	config,
	projectRoot,
	requiredFactKeys
}: {
	tsConfigPath: string,
	config: TSInput,
	projectRoot: string,
	requiredFactKeys?: Set<keyof TSCollectedFacts>,
}): {
	algorithmicBindings: AlgorithmicBinding[];
	constants: Constant[];
	dependsOn: DependsOn[];
	functionSignatures: FunctionSignature[];
	positionalSources: PositionalSource[];
	positionalAccesses: PositionalAccess[];
} {
	const seenFiles = new Set<string>();
	const constants: Constant[] = [];
	const dependsOn: DependsOn[] = [];
	const functionSignatures: FunctionSignature[] = [];
	const positionalSources: PositionalSource[] = [];
	const positionalAccesses: PositionalAccess[] = [];
	const algorithmicBindings: AlgorithmicBinding[] = [];

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

	return {
		algorithmicBindings,
		constants,
		dependsOn,
		functionSignatures,
		positionalAccesses,
		positionalSources,
	}
}
