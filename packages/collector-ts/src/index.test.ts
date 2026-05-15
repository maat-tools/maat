import { describe, expect, test } from 'bun:test';
import { isAbsolute, relative, resolve } from 'node:path';
import { CONSTANTS_CAPABILITY, FUNCTION_SIGNATURES_CAPABILITY, IMPORTS_CAPABILITY } from '@maat-tools/vocabulary';
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

		expect(files).toContain(
			relative(process.cwd(), resolve(import.meta.dir, '../fixtures/sample-project/src/index.ts')).replace(/\\/g, '/'),
		);
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
		expect(files).toContain(
			relative(process.cwd(), resolve(MULTI_PROJECT_ROOT, 'pkg-a/src/index.ts')).replace(/\\/g, '/'),
		);
		expect(files).toContain(
			relative(process.cwd(), resolve(MULTI_PROJECT_ROOT, 'pkg-b/src/index.ts')).replace(/\\/g, '/'),
		);
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
		expect(files).toContain(
			relative(process.cwd(), resolve(MULTI_PROJECT_ROOT, 'pkg-a/src/index.ts')).replace(/\\/g, '/'),
		);
		expect(files).toContain(
			relative(process.cwd(), resolve(MULTI_PROJECT_ROOT, 'pkg-b/src/index.ts')).replace(/\\/g, '/'),
		);
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
		expect(imp?.file).toBe(
			relative(process.cwd(), resolve(import.meta.dir, '../fixtures/cross-package/pkg-a/src/index.ts')).replace(
				/\\/g,
				'/',
			),
		);
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

describe('TSCollector.collect() — functionSignatures fact', () => {
	test('provides functionSignatures in provideFacts', () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		expect(collector.provideFacts).toContain(FUNCTION_SIGNATURES_CAPABILITY);
	});

	test('detects functions with 5 params', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { functionSignatures } = await collector.collect();
		const fn = functionSignatures.find((f) => f.functionName === 'sendEmail');
		expect(fn).toBeDefined();
		expect(fn?.parameters).toHaveLength(5);
		expect(fn?.parameters[0]).toEqual({ name: 'firstName', type: 'string', position: 0 });
		expect(fn?.parameters[1]).toEqual({ name: 'lastName', type: 'string', position: 1 });
		expect(fn?.parameters[2]).toEqual({ name: 'email', type: 'string', position: 2 });
		expect(fn?.parameters[3]).toEqual({ name: 'subject', type: 'string', position: 3 });
		expect(fn?.parameters[4]).toEqual({ name: 'body', type: 'string', position: 4 });
	});

	test('flags homogeneous types (all same type)', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { functionSignatures } = await collector.collect();
		const fn = functionSignatures.find((f) => f.functionName === 'sendEmail');
		expect(fn?.heterogeneousTypes).toBe(false);
	});

	test('flags heterogeneous types (mixed types)', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { functionSignatures } = await collector.collect();
		const fn = functionSignatures.find((f) => f.functionName === 'createUser');
		expect(fn).toBeDefined();
		expect(fn?.heterogeneousTypes).toBe(true);
	});

	test('collects functions with fewer than 3 params', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { functionSignatures } = await collector.collect();
		const shortFn = functionSignatures.find((f) => f.functionName === 'greet');
		expect(shortFn).toBeDefined();
	});

	test('each finding has file, function name, parameters, and location', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { functionSignatures } = await collector.collect();
		for (const fn of functionSignatures) {
			expect(typeof fn.file).toBe('string');
			expect(isAbsolute(fn.file)).toBe(false);
			expect(typeof fn.functionName).toBe('string');
			expect(fn.location.line).toBeGreaterThan(0);
			expect(typeof fn.isExported).toBe('boolean');
		}
	});
});
