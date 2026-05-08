import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { type Collector, defineCollector, type FactRegistry } from '@maat-tools/contracts';
import * as micromatch from 'micromatch';
import {
	CONSTANTS_CAPABILITY,
	type Constant,
	type ConstantContext,
	IMPORTS_CAPABILITY,
	type Import,
} from '@maat-tools/vocabulary';
import { Project, type SourceFile } from 'ts-morph';

export type TSInput = {
	tsConfigFilePath: string;
	exclude?: string[];
};

const DEFAULT_EXCLUDE_PATTERNS = ['**/*.test.ts', '**/*.spec.ts'];

const packageNameCache = new Map<string, string | null>();

function inferContext(parentKind: string | undefined): ConstantContext {
	switch (parentKind) {
		case 'ImportDeclaration':
		case 'ExportDeclaration':
			return 'import';
		case 'CallExpression':
		case 'NewExpression':
			return 'argument';
		case 'ReturnStatement':
			return 'return';
		case 'BinaryExpression':
		case 'ConditionalExpression':
			return 'condition';
		case 'Decorator':
			return 'decorator';
		default:
			return 'assignment';
	}
}

function toProjectRelativePath(projectRoot: string, filePath: string): string {
	return relative(projectRoot, filePath).replace(/\\/g, '/');
}

function resolvePackageName(filePath: string): string | null {
	let dir = dirname(filePath);

	while (true) {
		if (packageNameCache.has(dir)) {
			return packageNameCache.get(dir) ?? null;
		}

		const pkgPath = resolve(dir, 'package.json');
		if (existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
				const name = typeof pkg.name === 'string' ? pkg.name : null;
				packageNameCache.set(dir, name);

				return name;
			} catch {
				packageNameCache.set(dir, null);

				return null;
			}
		}

		const parent = dirname(dir);
		if (parent === dir) {
			break;
		}
		dir = parent;
	}

	return null;
}

function normalizeSpecifier(specifier: string, fromAbsoluteFile: string, fromPackage: string | null): string {
	if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
		return specifier;
	}

	const absoluteDest = resolve(dirname(fromAbsoluteFile), specifier);
	const destPackage = resolvePackageName(absoluteDest);

	if (destPackage !== null && destPackage !== fromPackage) {
		return destPackage;
	}

	return specifier;
}

function collectImports(sourceFile: SourceFile, file: string, packageName: string | null): Import[] {
	const absoluteFile = sourceFile.getFilePath();
	
	return sourceFile.getImportDeclarations().map((decl) => ({
		file,
		packageName,
		specifier: normalizeSpecifier(decl.getModuleSpecifierValue(), absoluteFile, packageName),
		location: {
			file,
			line: decl.getStartLineNumber(),
			column: decl.getStartLinePos(),
		},
	}));
}

function collectConstants(sourceFile: SourceFile, file: string): Constant[] {
	const constants: Constant[] = [];

	for (const node of sourceFile.getDescendants()) {
		const kind = node.getKindName();
		const raw = node.getText();
		const context = inferContext(node.getParent()?.getKindName());
		const location: Constant['location'] = {
			file,
			line: node.getStartLineNumber(),
			column: node.getStartLinePos(),
		};

		if (kind === 'StringLiteral') {
			constants.push({
				kind: 'string',
				value: raw.slice(1, -1),
				raw,
				context,
				location,
			});
		} else if (kind === 'NumericLiteral') {
			constants.push({ kind: 'number', value: raw, raw, context, location });
		}
	}

	return constants;
}

export class TSCollector implements Collector<'constants' | 'imports'> {
	public readonly id = 'ts';
	public readonly provideFacts = [CONSTANTS_CAPABILITY, IMPORTS_CAPABILITY] as const;

	public constructor(private readonly config: TSInput) {}

	public async collect(): Promise<Pick<FactRegistry, 'constants' | 'imports'>> {
		const resolvedPath = resolve(this.config.tsConfigFilePath);
		const projectRoot = dirname(resolvedPath);
		const project = new Project({ tsConfigFilePath: resolvedPath });
		const excludePatterns = this.config.exclude ?? DEFAULT_EXCLUDE_PATTERNS;

		const constants: Constant[] = [];
		const imports: Import[] = [];

		for (const sourceFile of project.getSourceFiles()) {
			const absoluteFile = sourceFile.getFilePath();
			const file = toProjectRelativePath(projectRoot, absoluteFile);

			if (micromatch.isMatch(file, excludePatterns)) {
				continue;
			}

			const packageName = resolvePackageName(absoluteFile);
			imports.push(...collectImports(sourceFile, file, packageName));
			constants.push(...collectConstants(sourceFile, file));
		}

		return { constants, imports };
	}
}

declare module '@maat-tools/contracts' {
	interface CollectorRegistry {
		'@maat-tools/collector-ts': TSInput;
	}
}

export default defineCollector((config: TSInput) => new TSCollector(config));
