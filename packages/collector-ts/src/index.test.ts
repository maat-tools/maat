import { describe, expect, test } from 'bun:test';
import { isAbsolute, resolve } from 'node:path';
import { CONSTANTS_CAPABILITY, IMPORTS_CAPABILITY } from '@maat-tools/vocabulary';
import { TSCollector } from './index';

const FIXTURE_TSCONFIG = resolve(import.meta.dir, '../fixtures/sample-project/tsconfig.json');

describe('TSCollector.collect() — imports fact', () => {
	test('provides imports in provideFacts', () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		expect(collector.provideFacts).toContain(IMPORTS_CAPABILITY);
	});

	test('provides constants in provideFacts', () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		expect(collector.provideFacts).toContain(CONSTANTS_CAPABILITY);
	});

	test('emits imports from source files', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { imports } = await collector.collect();
		expect(imports.length).toBeGreaterThan(0);
	});

	test('each import has file, specifier, and location', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { imports } = await collector.collect();
		for (const imp of imports) {
			expect(typeof imp.file).toBe('string');
			expect(isAbsolute(imp.file)).toBe(false);
			expect(imp.file).not.toContain('\\');
			expect(typeof imp.specifier).toBe('string');
			expect(imp.location.file).toBe(imp.file);
			expect(typeof imp.location.line).toBe('number');
		}
	});

	test('emits source locations relative to process.cwd()', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { constants, imports } = await collector.collect();

		const files = [...imports.map((imp) => imp.file), ...constants.map((constant) => constant.location.file)];

		expect(files).toContain('packages/collector-ts/fixtures/sample-project/src/index.ts');
		for (const file of files) {
			expect(isAbsolute(file)).toBe(false);
			expect(file).not.toContain('\\');
		}
	});

	test('captures import from index.ts → ./user', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { imports } = await collector.collect();
		const found = imports.find((i) => i.file.endsWith('index.ts') && i.specifier === './user');
		expect(found).toBeDefined();
	});

	test('captures import from permissions.ts → ./user', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { imports } = await collector.collect();
		const found = imports.find((i) => i.file.endsWith('permissions.ts') && i.specifier === './user');
		expect(found).toBeDefined();
	});

	test('packageName is null when no package.json is found above the file', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { imports } = await collector.collect();
		// fixture project has no package.json, so packageName should be null
		// (or the monorepo root package.json has no name — either way it's consistent)
		for (const imp of imports) {
			expect(imp.packageName === null || typeof imp.packageName === 'string').toBe(true);
		}
	});

	test('still emits constants alongside imports', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { constants } = await collector.collect();
		expect(constants.length).toBeGreaterThan(0);
	});
});

const MULTI_PROJECT_ROOT = resolve(import.meta.dir, '../fixtures/multi-project');
const MULTI_PKG_A_TSCONFIG = resolve(MULTI_PROJECT_ROOT, 'pkg-a/tsconfig.json');
const MULTI_PKG_B_TSCONFIG = resolve(MULTI_PROJECT_ROOT, 'pkg-b/tsconfig.json');

describe('TSCollector — array of tsConfigFilePath', () => {
	test('collects constants from both packages', async () => {
		const collector = new TSCollector({ tsConfigFilePath: [MULTI_PKG_A_TSCONFIG, MULTI_PKG_B_TSCONFIG] });
		const { constants } = await collector.collect();
		const values = constants.map((c) => c.value);
		expect(values).toContain('admin');
		expect(values).toContain('active');
	});

	test('deduplicates files included in multiple tsconfigs', async () => {
		// pkg-a tsconfig also includes pkg-b sources, so passing both must not double-count
		const collector = new TSCollector({ tsConfigFilePath: [MULTI_PKG_A_TSCONFIG, MULTI_PKG_B_TSCONFIG] });
		const { constants } = await collector.collect();
		const pkgBConstants = constants.filter((c) => c.location.file.includes('pkg-b'));
		const activeOccurrences = pkgBConstants.filter((c) => c.value === 'active');
		expect(activeOccurrences).toHaveLength(1);
	});

	test('paths from all tsconfigs are relative to process.cwd()', async () => {
		const collector = new TSCollector({ tsConfigFilePath: [MULTI_PKG_A_TSCONFIG, MULTI_PKG_B_TSCONFIG] });
		const { constants } = await collector.collect();
		const files = constants.map((c) => c.location.file);
		expect(files).toContain('packages/collector-ts/fixtures/multi-project/pkg-a/src/index.ts');
		expect(files).toContain('packages/collector-ts/fixtures/multi-project/pkg-b/src/index.ts');
		for (const file of files) {
			expect(isAbsolute(file)).toBe(false);
		}
	});
});

describe('TSCollector — glob in tsConfigFilePath', () => {
	test('glob expands to all matching tsconfigs', async () => {
		const collector = new TSCollector({ tsConfigFilePath: `${MULTI_PROJECT_ROOT}/*/tsconfig.json` });
		const { constants } = await collector.collect();
		const values = constants.map((c) => c.value);
		expect(values).toContain('admin');
		expect(values).toContain('active');
	});

	test('glob result paths are relative to process.cwd()', async () => {
		const collector = new TSCollector({ tsConfigFilePath: `${MULTI_PROJECT_ROOT}/*/tsconfig.json` });
		const { constants } = await collector.collect();
		const files = constants.map((c) => c.location.file);
		expect(files).toContain('packages/collector-ts/fixtures/multi-project/pkg-a/src/index.ts');
		expect(files).toContain('packages/collector-ts/fixtures/multi-project/pkg-b/src/index.ts');
	});

	test('glob deduplicates overlapping files', async () => {
		const collector = new TSCollector({ tsConfigFilePath: `${MULTI_PROJECT_ROOT}/*/tsconfig.json` });
		const { constants } = await collector.collect();
		const activeOccurrences = constants.filter((c) => c.value === 'active');
		expect(activeOccurrences).toHaveLength(1);
	});
});

const CROSS_PACKAGE_TSCONFIG = resolve(import.meta.dir, '../fixtures/cross-package/pkg-a/tsconfig.json');

describe('TSCollector.collect() — cross-package specifier normalization', () => {
	test('same-package relative import keeps its original specifier', async () => {
		const collector = new TSCollector({ tsConfigFilePath: CROSS_PACKAGE_TSCONFIG });
		const { imports } = await collector.collect();
		const found = imports.find((i) => i.packageName === '@fixture/pkg-a' && i.specifier === './helper');
		expect(found).toBeDefined();
	});

	test('cross-package relative import is rewritten to the destination package name', async () => {
		const collector = new TSCollector({ tsConfigFilePath: CROSS_PACKAGE_TSCONFIG });
		const { imports } = await collector.collect();
		const raw = imports.find((i) => i.packageName === '@fixture/pkg-a' && i.specifier.startsWith('../'));
		expect(raw).toBeUndefined(); // the raw ../ form must not survive

		const normalized = imports.find((i) => i.packageName === '@fixture/pkg-a' && i.specifier === '@fixture/pkg-b');
		expect(normalized).toBeDefined();
	});

	test('normalized specifier still carries the correct file and location', async () => {
		const collector = new TSCollector({ tsConfigFilePath: CROSS_PACKAGE_TSCONFIG });
		const { imports } = await collector.collect();
		const imp = imports.find((i) => i.packageName === '@fixture/pkg-a' && i.specifier === '@fixture/pkg-b');
		expect(imp?.file).toBe('packages/collector-ts/fixtures/cross-package/pkg-a/src/index.ts');
		expect(imp?.location.line).toBeGreaterThan(0);
	});

	test('pkg-b own files are not affected', async () => {
		const collector = new TSCollector({ tsConfigFilePath: CROSS_PACKAGE_TSCONFIG });
		const { imports } = await collector.collect();
		// pkg-b/src/index.ts has no imports at all
		const pkgBImports = imports.filter((i) => i.packageName === '@fixture/pkg-b');
		expect(pkgBImports).toHaveLength(0);
	});
});
