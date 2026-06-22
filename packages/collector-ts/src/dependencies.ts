import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { resolveProjectRoot } from '@maat-tools/utils';
import type { DependsOn } from '@maat-tools/vocabulary';
import { type Node, type SourceFile, type StandardizedFilePath, SyntaxKind } from 'ts-morph';
import { makeLocation } from './utils';

type PackageInfo = { name: string; rootPath: string };

const packageInformationCache = new Map<string, PackageInfo | null>();

export function toProjectRelativePath(projectRoot: string, filePath: string): string {
	return relative(projectRoot, filePath).replace(/\\/g, '/');
}

function resolvePackageInformation(filePath: string): PackageInfo | null {
	let dir = dirname(filePath);
	const visited: string[] = [];

	while (true) {
		if (packageInformationCache.has(dir)) {
			const cached = packageInformationCache.get(dir) ?? null;
			for (const d of visited) {
				packageInformationCache.set(d, cached);
			}

			return cached;
		}

		visited.push(dir);

		const pkgPath = resolve(dir, 'package.json');
		if (existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
				const name = typeof pkg.name === 'string' ? pkg.name : null;
				const rootPath = toProjectRelativePath(resolveProjectRoot(), dir);
				for (const d of visited) {
					packageInformationCache.set(d, { name, rootPath });
				}
				return { name, rootPath };
			} catch {
				for (const d of visited) {
					packageInformationCache.set(d, null);
				}
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

function internalImport(specifier: string): boolean {
	return specifier.startsWith('.') || specifier.startsWith('..');
}

function buildDependsOn({
	file,
	absoluteFile,
	node,
	value,
	isExternal,
	packageInfo,
}: {
	file: string;
	absoluteFile: StandardizedFilePath;
	node: Node;
	value: string;
	isExternal: boolean;
	packageInfo: PackageInfo | null;
}): DependsOn {
	return {
		from: {
			path: toProjectRelativePath(resolveProjectRoot(), absoluteFile),
			location: makeLocation(file, node),
			...(packageInfo ? { package: { name: packageInfo.name, rootPath: packageInfo.rootPath } } : {}),
		},
		to: {
			path: isExternal ? value : toProjectRelativePath(resolveProjectRoot(), resolve(dirname(absoluteFile), value)),
			isExternal,
			...(isExternal ? { package: { name: value } } : {}),
		},
	};
}

export function collectDependsOn(sourceFile: SourceFile, file: string): DependsOn[] {
	const absoluteFile = sourceFile.getFilePath();
	const packageInfo = resolvePackageInformation(absoluteFile);

	const requireCalls = sourceFile
		.getDescendantsOfKind(SyntaxKind.CallExpression)
		.filter((call) => call.getExpression().getText() === 'require')
		.map((call) => {
			const arg = call.getArguments()[0];
			const value = arg?.getText().slice(1, -1) ?? '';

			if (!arg || arg.getKind() !== SyntaxKind.StringLiteral) {
				return undefined;
			}

			const isExternal = !internalImport(value);

			return buildDependsOn({
				file,
				absoluteFile,
				node: arg,
				value,
				isExternal,
				packageInfo,
			});
		})
		.filter((call) => call !== undefined) as DependsOn[];

	const dynamicImportCalls = sourceFile
		.getDescendantsOfKind(SyntaxKind.CallExpression)
		.filter((call) => call.getExpression().getKind() === SyntaxKind.ImportKeyword)
		.map((call) => {
			const arg = call.getArguments()[0];
			if (!arg || arg.getKind() !== SyntaxKind.StringLiteral) {
				return undefined;
			}
			const value = arg.getText().slice(1, -1);
			const isExternal = !internalImport(value);
			return buildDependsOn({
				file,
				absoluteFile,
				node: arg,
				value,
				isExternal,
				packageInfo,
			});
		})
		.filter((d): d is DependsOn => d !== undefined);

	const importCalls = sourceFile
		.getImportDeclarations()
		.filter((decl) => !decl.isTypeOnly())
		.map((decl) => {
			const value = decl.getModuleSpecifierValue();
			const isExternal = !internalImport(value);

			return buildDependsOn({
				file,
				absoluteFile,
				node: decl.getModuleSpecifier(),
				value,
				isExternal,
				packageInfo,
			});
		});

	return [...requireCalls, ...dynamicImportCalls, ...importCalls];
}
