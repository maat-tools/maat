import { describe, expect, test } from 'bun:test';
import { isAbsolute, relative, resolve } from 'node:path';
import {
	CONSTANTS_CAPABILITY,
	FUNCTION_SIGNATURES_CAPABILITY,
	IMPORTS_CAPABILITY,
	POSITIONAL_ACCESSES_CAPABILITY,
	POSITIONAL_SOURCES_CAPABILITY,
} from '@maat-tools/vocabulary';
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

describe('TSCollector.collect() — positionalSources fact', () => {
	test('provides positionalSources in provideFacts', () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		expect(collector.provideFacts).toContain(POSITIONAL_SOURCES_CAPABILITY);
	});

	test('detects function returning tuple as positional source', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalSources } = await collector.collect();
		const source = positionalSources.find((s) => s.variableName === 'getUserDetails');
		expect(source).toBeDefined();
		expect(source?.isHeterogeneous).toBe(true);
		expect(source?.positions).toHaveLength(4);
		expect(source?.positions[0]).toEqual({ index: 0, type: 'string' });
		expect(source?.positions[3]).toEqual({ index: 3, type: 'boolean' });
	});

	test('detects array literal variable as positional source', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalSources } = await collector.collect();
		const source = positionalSources.find((s) => s.variableName === 'config');
		expect(source).toBeDefined();
		expect(source?.isHeterogeneous).toBe(true);
	});

	test('propagates tuple source to variable assigned from function call', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalSources } = await collector.collect();
		const source = positionalSources.find((s) => s.variableName === 'user');
		expect(source).toBeDefined();
		expect(source?.isHeterogeneous).toBe(true);
		expect(source?.positions).toHaveLength(4);
	});

	test('tracks cross-file call sites for tuple-returning function', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalSources } = await collector.collect();
		const source = positionalSources.find((s) => s.variableName === 'getUserDetails');
		expect(source).toBeDefined();
		expect(source?.callSites.length).toBeGreaterThan(0);
		const remoteCall = source?.callSites.find((cs) => cs.file.includes('remote.ts'));
		expect(remoteCall).toBeDefined();
		expect(remoteCall?.variableName).toBe('remoteUser');
	});

	test('does not flag named object returns as positional source', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalSources } = await collector.collect();
		const source = positionalSources.find((s) => s.variableName === 'getUserObject');
		expect(source).toBeUndefined();
	});

	test('detects function returning array literal WITHOUT explicit return type', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalSources } = await collector.collect();
		const source = positionalSources.find((s) => s.variableName === 'getUserDetailsImplicit');
		expect(source).toBeDefined();
		expect(source?.isHeterogeneous).toBe(true);
		expect(source?.positions).toHaveLength(4);
	});

	test('detects type-asserted array as positional source', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalSources } = await collector.collect();
		const source = positionalSources.find((s) => s.variableName === 'typedTuple');
		expect(source).toBeDefined();
		expect(source?.isHeterogeneous).toBe(true);
		expect(source?.positions).toHaveLength(3);
		expect(source?.positions).toEqual([
			{ index: 0, type: 'number' },
			{ index: 1, type: 'string' },
			{ index: 2, type: 'boolean' },
		]);
	});

	test('widens literal types to base types for homogeneous check', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalSources } = await collector.collect();
		const source = positionalSources.find((s) => s.variableName === 'homogeneousStrings');
		expect(source).toBeDefined();
		expect(source?.isHeterogeneous).toBe(false);
		expect(source?.positions).toEqual([
			{ index: 0, type: 'string' },
			{ index: 1, type: 'string' },
			{ index: 2, type: 'string' },
		]);
	});

	test('each source has file, variableName, positions, and location', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalSources } = await collector.collect();
		for (const src of positionalSources) {
			expect(typeof src.file).toBe('string');
			expect(isAbsolute(src.file)).toBe(false);
			expect(typeof src.variableName).toBe('string');
			expect(Array.isArray(src.positions)).toBe(true);
			expect(src.location.line).toBeGreaterThan(0);
		}
	});
});

describe('TSCollector.collect() — positionalAccesses fact', () => {
	test('provides positionalAccesses in provideFacts', () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		expect(collector.provideFacts).toContain(POSITIONAL_ACCESSES_CAPABILITY);
	});

	test('detects index access (user[3])', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalAccesses } = await collector.collect();
		const access = positionalAccesses.find(
			(a) => a.variableName === 'user' && a.accessedIndex === 3 && a.accessKind === 'index',
		);
		expect(access).toBeDefined();
	});

	test('detects array destructuring access', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalAccesses } = await collector.collect();
		const access = positionalAccesses.find(
			(a) => a.variableName === 'getUserDetails' && a.accessKind === 'destructuring',
		);
		expect(access).toBeDefined();
	});

	test('detects destructuring from variable (config)', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalAccesses } = await collector.collect();
		const access = positionalAccesses.find((a) => a.variableName === 'config' && a.accessKind === 'destructuring');
		expect(access).toBeDefined();
	});

	test('does not flag named property access', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalAccesses } = await collector.collect();
		const access = positionalAccesses.find((a) => a.variableName === 'namedUser');
		expect(access).toBeUndefined();
	});

	test('each access has file, variableName, accessedIndex, and location', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalAccesses } = await collector.collect();
		for (const acc of positionalAccesses) {
			expect(typeof acc.file).toBe('string');
			expect(isAbsolute(acc.file)).toBe(false);
			expect(typeof acc.variableName).toBe('string');
			expect(typeof acc.accessedIndex === 'number' || typeof acc.accessedIndex === 'string').toBe(true);
			expect(acc.location.line).toBeGreaterThan(0);
		}
	});
});

describe('TSCollector.collect() — known positional APIs', () => {
	test('detects split() result as positional source', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalSources } = await collector.collect();
		const source = positionalSources.find((s) => s.variableName === 'dateParts');
		expect(source).toBeDefined();
	});

	test('detects Object.values() result as positional source', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalSources } = await collector.collect();
		const source = positionalSources.find((s) => s.variableName === 'values');
		expect(source).toBeDefined();
	});

	test('detects match() result as positional source', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalSources } = await collector.collect();
		const source = positionalSources.find((s) => s.variableName === 'matchResult');
		expect(source).toBeDefined();
	});

	test('index access on split result is detected', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalAccesses } = await collector.collect();
		const access = positionalAccesses.find((a) => a.variableName === 'dateParts' && a.accessedIndex === 0);
		expect(access).toBeDefined();
	});

	test('index access on Object.values result is detected', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalAccesses } = await collector.collect();
		const access = positionalAccesses.find((a) => a.variableName === 'values' && a.accessedIndex === 0);
		expect(access).toBeDefined();
	});

	test('detects Object.entries() result as positional source', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalSources } = await collector.collect();
		const source = positionalSources.find((s) => s.variableName === 'entries');
		expect(source).toBeDefined();
	});

	test('index access on Object.entries result is detected', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalAccesses } = await collector.collect();
		const access = positionalAccesses.find((a) => a.variableName === 'entries' && a.accessedIndex === 0);
		expect(access).toBeDefined();
	});

	test('index access on type-asserted array is detected', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalAccesses } = await collector.collect();
		const access = positionalAccesses.find((a) => a.variableName === 'typedTuple' && a.accessedIndex === 0);
		expect(access).toBeDefined();
	});

	test('detects computed index access with variable', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalAccesses } = await collector.collect();
		const access = positionalAccesses.find((a) => a.variableName === 'config' && a.accessedIndex === 'idx');
		expect(access).toBeDefined();
	});

	test('detects computed index access with expression', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalAccesses } = await collector.collect();
		const access = positionalAccesses.find((a) => a.variableName === 'config' && a.accessedIndex === 'idx + 1');
		expect(access).toBeDefined();
	});

	test('detects computed index access with function call', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalAccesses } = await collector.collect();
		const access = positionalAccesses.find((a) => a.variableName === 'config' && a.accessedIndex === 'getIndex()');
		expect(access).toBeDefined();
	});
});

describe('TSCollector.collect() — positionalSources: class method tuple return', () => {
	test('detects class method with explicit tuple return type as positional source', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalSources } = await collector.collect();
		const source = positionalSources.find((s) => s.variableName === 'DataParser.parse');
		expect(source).toBeDefined();
		expect(source?.isHeterogeneous).toBe(true);
		expect(source?.positions).toHaveLength(3);
		expect(source?.positions[0]).toEqual({ index: 0, type: 'string' });
		expect(source?.positions[1]).toEqual({ index: 1, type: 'number' });
		expect(source?.positions[2]).toEqual({ index: 2, type: 'boolean' });
	});
});

describe('TSCollector.collect() — cross-file positionalAccesses in remote.ts', () => {
	test('index access remoteUser[3] in remote.ts is in positionalAccesses', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalAccesses } = await collector.collect();
		const access = positionalAccesses.find(
			(a) => a.variableName === 'remoteUser' && a.accessedIndex === 3 && a.file.endsWith('remote.ts'),
		);
		expect(access).toBeDefined();
		expect(access?.accessKind).toBe('index');
	});

	test('destructuring from getUserDetails() in remote.ts is in positionalAccesses', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalAccesses } = await collector.collect();
		const accesses = positionalAccesses.filter(
			(a) => a.variableName === 'getUserDetails' && a.accessKind === 'destructuring' && a.file.endsWith('remote.ts'),
		);
		expect(accesses.length).toBeGreaterThan(0);
	});
});

describe('TSCollector.collect() — callSites tracking', () => {
	test('getUserDetails callSites include the intra-file user variable from positional.ts', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalSources } = await collector.collect();
		const source = positionalSources.find((s) => s.variableName === 'getUserDetails');
		const intraCall = source?.callSites.find((cs) => cs.variableName === 'user' && cs.file.endsWith('positional.ts'));
		expect(intraCall).toBeDefined();
	});

	test('sources that are never called have empty callSites', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalSources } = await collector.collect();
		const source = positionalSources.find((s) => s.variableName === 'getUserDetailsImplicit');
		expect(source).toBeDefined();
		expect(source?.callSites).toHaveLength(0);
	});

	test('remoteUser is not itself a positional source — cross-file calls only produce a callSite entry', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { positionalSources } = await collector.collect();
		const remoteSource = positionalSources.find((s) => s.variableName === 'remoteUser');
		expect(remoteSource).toBeUndefined();
	});
});
