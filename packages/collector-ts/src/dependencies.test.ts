import { describe, expect, test } from 'bun:test';
import { relative, resolve } from 'node:path';
import { Project } from 'ts-morph';
import { collectDependsOn, toProjectRelativePath } from './dependencies';

const FIXTURE_TSCONFIG = resolve(import.meta.dir, '../../../tests/fixtures/sample-project/tsconfig.json');
const CROSS_PACKAGE_TSCONFIG = resolve(import.meta.dir, '../../../tests/fixtures/cross-package/pkg-a/tsconfig.json');

function projectFromSource(source: string) {
	const project = new Project({ useInMemoryFileSystem: true });
	const sourceFile = project.createSourceFile('src/index.ts', source);
	return { project, sourceFile, file: 'src/index.ts' };
}

describe('toProjectRelativePath()', () => {
	test('returns a POSIX-style relative path', () => {
		const root = '/home/project';
		const path = '/home/project/src/index.ts';
		expect(toProjectRelativePath(root, path)).toBe('src/index.ts');
	});

	test('output never contains Windows separators', () => {
		const root = '/home/project';
		const path = '/home/project/src/index.ts';
		expect(toProjectRelativePath(root, path)).not.toContain('\\');
	});
});

describe('collectDependsOn() — import declarations', () => {
	test('captures relative imports', () => {
		const { sourceFile, file } = projectFromSource("import { foo } from './foo';");
		const [dep] = collectDependsOn(sourceFile, file);
		expect(dep).toBeDefined();
		expect(dep?.to.path.endsWith('src/foo')).toBe(true);
		expect(dep?.to.isExternal).toBe(false);
	});

	test('captures external imports', () => {
		const { sourceFile, file } = projectFromSource("import { foo } from 'some-package';");
		const [dep] = collectDependsOn(sourceFile, file);
		expect(dep).toBeDefined();
		expect(dep?.to.path).toBe('some-package');
		expect(dep?.to.isExternal).toBe(true);
		expect(dep?.to.package).toEqual({ name: 'some-package' });
	});

	test('captures require calls', () => {
		const { sourceFile, file } = projectFromSource("const foo = require('./foo');");
		const [dep] = collectDependsOn(sourceFile, file);
		expect(dep).toBeDefined();
		expect(dep?.to.path.endsWith('src/foo')).toBe(true);
	});

	test('captures dynamic imports', () => {
		const { sourceFile, file } = projectFromSource("const foo = await import('./foo');");
		const [dep] = collectDependsOn(sourceFile, file);
		expect(dep).toBeDefined();
		expect(dep?.to.path.endsWith('src/foo')).toBe(true);
	});

	test('ignores require calls with non-string arguments', () => {
		const { sourceFile, file } = projectFromSource('const foo = require(someVar);');
		const deps = collectDependsOn(sourceFile, file);
		expect(deps).toHaveLength(0);
	});

	test('includes source location for each dependency', () => {
		const { sourceFile, file } = projectFromSource("import { foo } from './foo';");
		const [dep] = collectDependsOn(sourceFile, file);
		expect(dep?.from.location.file).toBe(file);
		expect(dep?.from.location.line).toBe(1);
	});
});

describe('collectDependsOn() — fixture project', () => {
	test('captures dependsOn from index.ts → user', () => {
		const project = new Project({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const sourceFile = project.getSourceFileOrThrow(resolve(FIXTURE_TSCONFIG, '../src/index.ts'));
		const file = relative(process.cwd(), sourceFile.getFilePath()).replace(/\\/g, '/');
		const deps = collectDependsOn(sourceFile, file);
		const found = deps.find((dep) => dep.to.path.match(/\/user(\.ts)?$/));
		expect(found).toBeDefined();
	});

	test('each dependsOn has from.path, to.path, and location', () => {
		const project = new Project({ tsConfigFilePath: FIXTURE_TSCONFIG });
		for (const sourceFile of project.getSourceFiles()) {
			const file = relative(process.cwd(), sourceFile.getFilePath()).replace(/\\/g, '/');
			const deps = collectDependsOn(sourceFile, file);
			for (const dep of deps) {
				expect(typeof dep.from.path).toBe('string');
				expect(dep.from.path).toBe(file);
				expect(typeof dep.to.path).toBe('string');
				expect(dep.from.location.file).toBe(file);
				expect(typeof dep.from.location.line).toBe('number');
			}
		}
	});
});

describe('collectDependsOn() — cross-package specifier normalization', () => {
	test('same-package relative import is stored as resolved path', () => {
		const project = new Project({ tsConfigFilePath: CROSS_PACKAGE_TSCONFIG });
		const sourceFile = project.getSourceFileOrThrow(resolve(CROSS_PACKAGE_TSCONFIG, '../src/index.ts'));
		const file = relative(process.cwd(), sourceFile.getFilePath()).replace(/\\/g, '/');
		const deps = collectDependsOn(sourceFile, file);
		const found = deps.find(
			(dep) => dep.from.package?.name === '@fixture/pkg-a' && dep.to.path.match(/\/helper(\.ts)?$/),
		);
		expect(found).toBeDefined();
	});

	test('cross-package relative import is stored as resolved file path', () => {
		const project = new Project({ tsConfigFilePath: CROSS_PACKAGE_TSCONFIG });
		const sourceFile = project.getSourceFileOrThrow(resolve(CROSS_PACKAGE_TSCONFIG, '../src/index.ts'));
		const file = relative(process.cwd(), sourceFile.getFilePath()).replace(/\\/g, '/');
		const deps = collectDependsOn(sourceFile, file);
		const crossPkg = deps.find(
			(dep) => dep.from.package?.name === '@fixture/pkg-a' && dep.to.path.includes('pkg-b/src/index'),
		);
		expect(crossPkg).toBeDefined();
		expect(crossPkg?.to.path.endsWith('pkg-b/src/index')).toBe(true);
	});

	test('from.package is populated when package.json is found', () => {
		const project = new Project({ tsConfigFilePath: CROSS_PACKAGE_TSCONFIG });
		const sourceFile = project.getSourceFileOrThrow(resolve(CROSS_PACKAGE_TSCONFIG, '../src/index.ts'));
		const file = relative(process.cwd(), sourceFile.getFilePath()).replace(/\\/g, '/');
		const deps = collectDependsOn(sourceFile, file);
		for (const dep of deps) {
			expect(dep.from.package?.name).toBe('@fixture/pkg-a');
		}
	});
});
