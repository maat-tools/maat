import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import {
	ALGORITHMIC_BINDINGS_CAPABILITY,
	CALL_GRAPH_CAPABILITY,
	CONSTANTS_CAPABILITY,
	DEPENDS_ON_CAPABILITY,
	FUNCTION_SIGNATURES_CAPABILITY,
	POSITIONAL_ACCESSES_CAPABILITY,
	POSITIONAL_SOURCES_CAPABILITY,
} from '@maat-tools/vocabulary';
import type { TSCollectedFacts } from './index';
import { TSCollector } from './index';

const FIXTURE_TSCONFIG = resolve(import.meta.dir, '../../../tests/fixtures/sample-project/tsconfig.json');

// Collected once for the whole file — all FIXTURE_TSCONFIG tests share this result
let sharedFacts: TSCollectedFacts;
beforeAll(async () => {
	const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
	sharedFacts = await collector.collect();
});

describe('TSCollector', () => {
	test('advertises all supported facts', () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		expect(collector.provideFacts).toEqual([
			CONSTANTS_CAPABILITY,
			DEPENDS_ON_CAPABILITY,
			FUNCTION_SIGNATURES_CAPABILITY,
			POSITIONAL_SOURCES_CAPABILITY,
			POSITIONAL_ACCESSES_CAPABILITY,
			ALGORITHMIC_BINDINGS_CAPABILITY,
			CALL_GRAPH_CAPABILITY,
		]);
	});

	test('collect() returns every supported fact category', () => {
		expect(sharedFacts.dependsOn).toBeDefined();
		expect(sharedFacts.constants).toBeDefined();
		expect(sharedFacts.functionSignatures).toBeDefined();
		expect(sharedFacts.positionalSources).toBeDefined();
		expect(sharedFacts.positionalAccesses).toBeDefined();
		expect(sharedFacts.algorithmicBindings).toBeDefined();
		expect(sharedFacts.callGraph).toBeDefined();
	});

	test('collect() emits findings from the fixture project', () => {
		const { dependsOn, constants, functionSignatures, positionalSources, positionalAccesses } = sharedFacts;
		expect(dependsOn.length).toBeGreaterThan(0);
		expect(constants.length).toBeGreaterThan(0);
		expect(functionSignatures.length).toBeGreaterThan(0);
		expect(positionalSources.length).toBeGreaterThan(0);
		expect(positionalAccesses.length).toBeGreaterThan(0);
	});

	test('emitted file paths are relative to process.cwd()', () => {
		const { constants, dependsOn, functionSignatures, positionalSources, positionalAccesses } = sharedFacts;
		const files = [
			...dependsOn.map((dep) => dep.from.path),
			...constants.map((constant) => constant.location.file),
			...functionSignatures.map((fn) => fn.file),
			...positionalSources.map((source) => source.file),
			...positionalAccesses.map((access) => access.file),
		];

		expect(files).toContain(
			relative(process.cwd(), resolve(import.meta.dir, '../../../tests/fixtures/sample-project/src/index.ts')).replace(
				/\\/g,
				'/',
			),
		);
		for (const file of files) {
			expect(isAbsolute(file)).toBe(false);
			expect(file).not.toContain('\\');
		}
	});

	test('captures dependsOn from index.ts → user (resolved path)', () => {
		const found = sharedFacts.dependsOn.find(
			(dep) => dep.from.path.endsWith('index.ts') && dep.to.path.match(/\/user(\.ts)?$/),
		);
		expect(found).toBeDefined();
	});

	test('captures dependsOn from permissions.ts → user (resolved path)', () => {
		const found = sharedFacts.dependsOn.find(
			(dep) => dep.from.path.endsWith('permissions.ts') && dep.to.path.match(/\/user(\.ts)?$/),
		);
		expect(found).toBeDefined();
	});

	test('from.package is null or defined when package.json is found', () => {
		for (const dep of sharedFacts.dependsOn) {
			expect(dep.from.package === undefined || typeof dep.from.package.name === 'string').toBe(true);
		}
	});

	test('still emits constants alongside dependsOn', () => {
		expect(sharedFacts.constants.length).toBeGreaterThan(0);
	});
});

const MULTI_PROJECT_ROOT = resolve(import.meta.dir, '../../../tests/fixtures/multi-project');
const MULTI_PKG_A_TSCONFIG = resolve(MULTI_PROJECT_ROOT, 'pkg-a/tsconfig.json');
const MULTI_PKG_B_TSCONFIG = resolve(MULTI_PROJECT_ROOT, 'pkg-b/tsconfig.json');

describe('TSCollector — array of tsConfigFilePath', () => {
	let multiProjectFacts: TSCollectedFacts;
	beforeAll(async () => {
		const collector = new TSCollector({ tsConfigFilePath: [MULTI_PKG_A_TSCONFIG, MULTI_PKG_B_TSCONFIG] });
		multiProjectFacts = await collector.collect();
	});

	test('collects constants from both packages', () => {
		const values = multiProjectFacts.constants.map((c) => c.value);
		expect(values).toContain('admin');
		expect(values).toContain('active');
	});

	test('deduplicates files included in multiple tsconfigs', () => {
		const pkgBConstants = multiProjectFacts.constants.filter((c) => c.location.file.includes('pkg-b'));
		const activeOccurrences = pkgBConstants.filter((c) => c.value === 'active');
		expect(activeOccurrences).toHaveLength(1);
	});

	test('paths from all tsconfigs are relative to process.cwd()', () => {
		const files = multiProjectFacts.constants.map((c) => c.location.file);
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
	let globFacts: TSCollectedFacts;
	beforeAll(async () => {
		const collector = new TSCollector({ tsConfigFilePath: `${MULTI_PROJECT_ROOT}/*/tsconfig.json` });
		globFacts = await collector.collect();
	});

	test('glob expands to all matching tsconfigs', () => {
		const values = globFacts.constants.map((c) => c.value);
		expect(values).toContain('admin');
		expect(values).toContain('active');
	});

	test('glob result paths are relative to process.cwd()', () => {
		const files = globFacts.constants.map((c) => c.location.file);
		expect(files).toContain(
			relative(process.cwd(), resolve(MULTI_PROJECT_ROOT, 'pkg-a/src/index.ts')).replace(/\\/g, '/'),
		);
		expect(files).toContain(
			relative(process.cwd(), resolve(MULTI_PROJECT_ROOT, 'pkg-b/src/index.ts')).replace(/\\/g, '/'),
		);
	});

	test('glob deduplicates overlapping files', () => {
		const activeOccurrences = globFacts.constants.filter((c) => c.value === 'active');
		expect(activeOccurrences).toHaveLength(1);
	});
});

const CROSS_PACKAGE_TSCONFIG = resolve(import.meta.dir, '../../../tests/fixtures/cross-package/pkg-a/tsconfig.json');

describe('TSCollector.collect() — cross-package specifier normalization', () => {
	let crossPackageFacts: TSCollectedFacts;
	beforeAll(async () => {
		const collector = new TSCollector({ tsConfigFilePath: CROSS_PACKAGE_TSCONFIG });
		crossPackageFacts = await collector.collect();
	});

	test('same-package relative import is stored as resolved path', () => {
		const found = crossPackageFacts.dependsOn.find(
			(dep) => dep.from.package?.name === '@fixture/pkg-a' && dep.to.path.match(/\/helper(\.ts)?$/),
		);
		expect(found).toBeDefined();
	});

	test('cross-package relative import is stored as resolved file path (no original ../ specifier)', () => {
		const raw = crossPackageFacts.dependsOn.find(
			(dep) => dep.from.package?.name === '@fixture/pkg-a' && dep.to.path.startsWith('../'),
		);
		expect(raw).toBeUndefined();

		const resolved = crossPackageFacts.dependsOn.find(
			(dep) => dep.from.package?.name === '@fixture/pkg-a' && dep.to.path.includes('pkg-b'),
		);
		expect(resolved).toBeDefined();
	});

	test('cross-package dep carries correct source file and location', () => {
		const dep = crossPackageFacts.dependsOn.find(
			(d) => d.from.package?.name === '@fixture/pkg-a' && d.to.path.includes('pkg-b'),
		);
		expect(dep?.from.path).toBe(
			relative(
				process.cwd(),
				resolve(import.meta.dir, '../../../tests/fixtures/cross-package/pkg-a/src/index.ts'),
			).replace(/\\/g, '/'),
		);
		expect(dep?.from.location.line).toBeGreaterThan(0);
	});

	test('pkg-b own files are not affected', () => {
		const pkgBDeps = crossPackageFacts.dependsOn.filter((dep) => dep.from.package?.name === '@fixture/pkg-b');
		expect(pkgBDeps).toHaveLength(0);
	});
});

describe('TSCollector.collect() — functionSignatures fact', () => {
	test('provides functionSignatures in provideFacts', () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		expect(collector.provideFacts).toContain(FUNCTION_SIGNATURES_CAPABILITY);
	});

	test('detects functions with 5 params', () => {
		const fn = sharedFacts.functionSignatures.find((f) => f.name === 'sendEmail');
		expect(fn).toBeDefined();
		expect(fn?.input.parameters).toHaveLength(5);
		expect(fn?.input.parameters[0]).toEqual({ name: 'firstName', type: 'string', position: 0 });
		expect(fn?.input.parameters[1]).toEqual({ name: 'lastName', type: 'string', position: 1 });
		expect(fn?.input.parameters[2]).toEqual({ name: 'email', type: 'string', position: 2 });
		expect(fn?.input.parameters[3]).toEqual({ name: 'subject', type: 'string', position: 3 });
		expect(fn?.input.parameters[4]).toEqual({ name: 'body', type: 'string', position: 4 });
	});

	test('flags homogeneous types (all same type)', () => {
		const fn = sharedFacts.functionSignatures.find((f) => f.name === 'sendEmail');
		expect(fn).toBeDefined();
		expect(fn?.input.heterogeneous).toBe(false);
	});

	test('flags heterogeneous types (mixed types)', () => {
		const fn = sharedFacts.functionSignatures.find((f) => f.name === 'createUser');
		expect(fn).toBeDefined();
		expect(fn?.input.heterogeneous).toBe(true);
	});

	test('collects functions with fewer than 3 params', () => {
		const shortFn = sharedFacts.functionSignatures.find((f) => f.name === 'greet');
		expect(shortFn).toBeDefined();
	});

	test('each finding has file, function name, parameters, and location', () => {
		for (const fn of sharedFacts.functionSignatures) {
			expect(typeof fn.file).toBe('string');
			expect(isAbsolute(fn.file)).toBe(false);
			expect(typeof fn.name).toBe('string');
			expect(fn.location.line).toBeGreaterThan(0);
			expect(typeof fn.exported).toBe('boolean');
		}
	});

	test('captures output returnType for void function', () => {
		const fn = sharedFacts.functionSignatures.find((f) => f.name === 'sendEmail');
		expect(fn).toBeDefined();
		expect(fn?.output.returnType).toBe('void');
	});

	test('captures output returnType for union type', () => {
		const fn = sharedFacts.functionSignatures.find((f) => f.name === 'UserService.findById');
		expect(fn).toBeDefined();
		expect(fn?.output.returnType).toContain('User | undefined');
	});

	test('flags output heterogeneous for union return type', () => {
		const fn = sharedFacts.functionSignatures.find((f) => f.name === 'UserService.findById');
		expect(fn).toBeDefined();
		expect(fn?.output.heterogeneous).toBe(true);
	});

	test('flags output homogeneous for single return type', () => {
		const fn = sharedFacts.functionSignatures.find((f) => f.name === 'greet');
		expect(fn).toBeDefined();
		expect(fn?.output.heterogeneous).toBe(false);
		expect(fn?.output.returnType).toBe('string');
	});

	test('collects returnSites for function with return statement', () => {
		const fn = sharedFacts.functionSignatures.find((f) => f.name === 'greet');
		expect(fn).toBeDefined();
		expect(fn?.output.returnSites).toHaveLength(1);
		expect(fn?.output.returnSites[0]?.value).toContain('Hello,');
		expect(fn?.output.returnSites[0]?.location.line).toBeGreaterThan(0);
	});

	test('collects returnSites for method with return statement', () => {
		const fn = sharedFacts.functionSignatures.find((f) => f.name === 'UserService.findById');
		expect(fn).toBeDefined();
		expect(fn?.output.returnSites).toHaveLength(1);
		expect(fn?.output.returnSites[0]?.location.line).toBeGreaterThan(0);
	});

	test('void functions have no returnSites', () => {
		const fn = sharedFacts.functionSignatures.find((f) => f.name === 'sendEmail');
		expect(fn).toBeDefined();
		expect(fn?.output.returnSites).toHaveLength(0);
	});
});

describe('TSCollector.collect() — positionalSources fact', () => {
	test('provides positionalSources in provideFacts', () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		expect(collector.provideFacts).toContain(POSITIONAL_SOURCES_CAPABILITY);
	});

	test('detects function returning tuple as positional source', () => {
		const source = sharedFacts.positionalSources.find((s) => s.name === 'getUserDetails');
		expect(source).toBeDefined();
		expect(source?.isHeterogeneous).toBe(true);
		expect(source?.positions).toHaveLength(4);
		expect(source?.positions[0]).toEqual({ index: 0, type: 'string' });
		expect(source?.positions[3]).toEqual({ index: 3, type: 'boolean' });
	});

	test('detects array literal variable as positional source', () => {
		const source = sharedFacts.positionalSources.find((s) => s.name === 'config');
		expect(source).toBeDefined();
		expect(source?.isHeterogeneous).toBe(true);
	});

	test('propagates tuple source to variable assigned from function call', () => {
		const source = sharedFacts.positionalSources.find((s) => s.name === 'user');
		expect(source).toBeDefined();
		expect(source?.isHeterogeneous).toBe(true);
		expect(source?.positions).toHaveLength(4);
	});

	test('does not flag named object returns as positional source', () => {
		const source = sharedFacts.positionalSources.find((s) => s.name === 'getUserObject');
		expect(source).toBeUndefined();
	});

	test('detects function returning array literal WITHOUT explicit return type', () => {
		const source = sharedFacts.positionalSources.find((s) => s.name === 'getUserDetailsImplicit');
		expect(source).toBeDefined();
		expect(source?.isHeterogeneous).toBe(true);
		expect(source?.positions).toHaveLength(4);
	});

	test('detects type-asserted array as positional source', () => {
		const source = sharedFacts.positionalSources.find((s) => s.name === 'typedTuple');
		expect(source).toBeDefined();
		expect(source?.isHeterogeneous).toBe(true);
		expect(source?.positions).toHaveLength(3);
		expect(source?.positions).toEqual([
			{ index: 0, type: 'number' },
			{ index: 1, type: 'string' },
			{ index: 2, type: 'boolean' },
		]);
	});

	test('widens literal types to base types for homogeneous check', () => {
		const source = sharedFacts.positionalSources.find((s) => s.name === 'homogeneousStrings');
		expect(source).toBeDefined();
		expect(source?.isHeterogeneous).toBe(false);
		expect(source?.positions).toEqual([
			{ index: 0, type: 'string' },
			{ index: 1, type: 'string' },
			{ index: 2, type: 'string' },
		]);
	});

	test('each source has file, name, positions, and location', () => {
		for (const src of sharedFacts.positionalSources) {
			expect(typeof src.file).toBe('string');
			expect(isAbsolute(src.file)).toBe(false);
			expect(typeof src.name).toBe('string');
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

	test('detects index access (user[3])', () => {
		const access = sharedFacts.positionalAccesses.find(
			(a) => a.name === 'user' && a.accessedIndex === 3 && a.accessKind === 'index',
		);
		expect(access).toBeDefined();
	});

	test('detects array destructuring access', () => {
		const access = sharedFacts.positionalAccesses.find(
			(a) => a.name === 'getUserDetails' && a.accessKind === 'destructuring',
		);
		expect(access).toBeDefined();
	});

	test('detects destructuring from variable (config)', () => {
		const access = sharedFacts.positionalAccesses.find((a) => a.name === 'config' && a.accessKind === 'destructuring');
		expect(access).toBeDefined();
	});

	test('does not flag named property access', () => {
		const access = sharedFacts.positionalAccesses.find((a) => a.name === 'namedUser');
		expect(access).toBeUndefined();
	});

	test('each access has file, name, accessedIndex, and location', () => {
		for (const acc of sharedFacts.positionalAccesses) {
			expect(typeof acc.file).toBe('string');
			expect(isAbsolute(acc.file)).toBe(false);
			expect(typeof acc.name).toBe('string');
			expect(typeof acc.accessedIndex === 'number' || typeof acc.accessedIndex === 'string').toBe(true);
			expect(acc.location.line).toBeGreaterThan(0);
		}
	});
});

describe('TSCollector.collect() — known positional APIs', () => {
	test('detects split() result as positional source', () => {
		const source = sharedFacts.positionalSources.find((s) => s.name === 'dateParts');
		expect(source).toBeDefined();
	});

	test('detects Object.values() result as positional source', () => {
		const source = sharedFacts.positionalSources.find((s) => s.name === 'values');
		expect(source).toBeDefined();
	});

	test('detects match() result as positional source', () => {
		const source = sharedFacts.positionalSources.find((s) => s.name === 'matchResult');
		expect(source).toBeDefined();
	});

	test('index access on split result is detected', () => {
		const access = sharedFacts.positionalAccesses.find((a) => a.name === 'dateParts' && a.accessedIndex === 0);
		expect(access).toBeDefined();
	});

	test('index access on Object.values result is detected', () => {
		const access = sharedFacts.positionalAccesses.find((a) => a.name === 'values' && a.accessedIndex === 0);
		expect(access).toBeDefined();
	});

	test('detects Object.entries() result as positional source', () => {
		const source = sharedFacts.positionalSources.find((s) => s.name === 'entries');
		expect(source).toBeDefined();
	});

	test('index access on Object.entries result is detected', () => {
		const access = sharedFacts.positionalAccesses.find((a) => a.name === 'entries' && a.accessedIndex === 0);
		expect(access).toBeDefined();
	});

	test('index access on type-asserted array is detected', () => {
		const access = sharedFacts.positionalAccesses.find((a) => a.name === 'typedTuple' && a.accessedIndex === 0);
		expect(access).toBeDefined();
	});

	test('detects computed index access with variable', () => {
		const access = sharedFacts.positionalAccesses.find((a) => a.name === 'config' && a.accessedIndex === 'idx');
		expect(access).toBeDefined();
	});

	test('detects computed index access with expression', () => {
		const access = sharedFacts.positionalAccesses.find((a) => a.name === 'config' && a.accessedIndex === 'idx + 1');
		expect(access).toBeDefined();
	});

	test('detects computed index access with function call', () => {
		const access = sharedFacts.positionalAccesses.find((a) => a.name === 'config' && a.accessedIndex === 'getIndex()');
		expect(access).toBeDefined();
	});
});

describe('TSCollector.collect() — positionalSources: class method tuple return', () => {
	test('detects class method with explicit tuple return type as positional source', () => {
		const source = sharedFacts.positionalSources.find((s) => s.name === 'DataParser.parse');
		expect(source).toBeDefined();
		expect(source?.isHeterogeneous).toBe(true);
		expect(source?.positions).toHaveLength(3);
		expect(source?.positions[0]).toEqual({ index: 0, type: 'string' });
		expect(source?.positions[1]).toEqual({ index: 1, type: 'number' });
		expect(source?.positions[2]).toEqual({ index: 2, type: 'boolean' });
	});
});

describe('TSCollector.collect() — cross-file positionalAccesses in remote.ts', () => {
	test('index access remoteUser[3] in remote.ts is in positionalAccesses', () => {
		const access = sharedFacts.positionalAccesses.find(
			(a) => a.name === 'remoteUser' && a.accessedIndex === 3 && a.file.endsWith('remote.ts'),
		);
		expect(access).toBeDefined();
		expect(access?.accessKind).toBe('index');
	});

	test('destructuring from getUserDetails() in remote.ts is in positionalAccesses', () => {
		const accesses = sharedFacts.positionalAccesses.filter(
			(a) => a.name === 'getUserDetails' && a.accessKind === 'destructuring' && a.file.endsWith('remote.ts'),
		);
		expect(accesses.length).toBeGreaterThan(0);
	});
});

describe('TSCollector.collect() — algorithmicBindings fact', () => {
	test('provides algorithmicBindings in provideFacts', () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		expect(collector.provideFacts).toContain(ALGORITHMIC_BINDINGS_CAPABILITY);
	});

	test('emits no bindings when no patterns configured', () => {
		expect(sharedFacts.algorithmicBindings).toHaveLength(0);
	});

	describe('emits bindings for matching call expressions', () => {
		let packUnpackFacts: TSCollectedFacts;
		beforeAll(async () => {
			const collector = new TSCollector({
				tsConfigFilePath: FIXTURE_TSCONFIG,
				algorithmicPatterns: [
					{
						id: 'pack-unpack',
						roles: ['packer', 'unpacker'],
						matchers: [
							{ role: 'packer', functionPattern: '\\.join$', literalArgIndex: 0 },
							{ role: 'unpacker', functionPattern: '\\.split$', literalArgIndex: 0 },
						],
					},
				],
			});
			packUnpackFacts = await collector.collect();
		});

		test('emits bindings for matching call expressions', () => {
			expect(packUnpackFacts.algorithmicBindings.length).toBeGreaterThan(0);

			const splitBindings = packUnpackFacts.algorithmicBindings.filter((b) => b.functionName.includes('split'));
			expect(splitBindings.length).toBeGreaterThan(0);
			for (const b of splitBindings) {
				expect(b.patternId).toBe('pack-unpack');
				expect(b.role).toBe('unpacker');
				expect(typeof b.bindingKey).toBe('string');
				expect(b.file).not.toContain('\\');
				expect(b.location.line).toBeGreaterThan(0);
			}
		});
	});

	describe('does not emit bindings for non-matching functions', () => {
		let hashVerifyFacts: TSCollectedFacts;
		beforeAll(async () => {
			const collector = new TSCollector({
				tsConfigFilePath: FIXTURE_TSCONFIG,
				algorithmicPatterns: [
					{
						id: 'hash-verify',
						roles: ['hasher'],
						matchers: [{ role: 'hasher', functionPattern: '^createHash$', literalArgIndex: 0 }],
					},
				],
			});
			hashVerifyFacts = await collector.collect();
		});

		test('does not emit bindings for non-matching functions', () => {
			expect(hashVerifyFacts.algorithmicBindings).toHaveLength(0);
		});
	});

	describe('template-literal bindings', () => {
		let templateFacts: TSCollectedFacts;
		beforeAll(async () => {
			const collector = new TSCollector({
				tsConfigFilePath: FIXTURE_TSCONFIG,
				algorithmicPatterns: [
					{
						id: 'pack-unpack',
						roles: ['packer', 'unpacker'],
						matchers: [
							{ role: 'packer', functionPattern: '^template-literal$', expressionKind: 'template' },
							{ role: 'unpacker', functionPattern: '\\.split$', literalArgIndex: 0 },
						],
					},
				],
			});
			templateFacts = await collector.collect();
		});

		test('emits template-literal bindings when expressionKind is template', () => {
			const templateBindings = templateFacts.algorithmicBindings.filter((b) => b.functionName === 'template-literal');
			expect(templateBindings.length).toBeGreaterThan(0);
			for (const b of templateBindings) {
				expect(b.patternId).toBe('pack-unpack');
				expect(b.role).toBe('packer');
			}
		});
	});

	describe('new expression bindings', () => {
		const tmpDir = resolve(import.meta.dir, '../../../tests/fixtures/new-expression-test');
		let newExprFacts: TSCollectedFacts;

		beforeAll(async () => {
			const srcDir = resolve(tmpDir, 'src');
			await mkdir(srcDir, { recursive: true });
			const tsConfigPath = resolve(tmpDir, 'tsconfig.json');
			await writeFile(tsConfigPath, JSON.stringify({ compilerOptions: {} }));
			await writeFile(resolve(srcDir, 'parse.ts'), 'const d = new Date("2024-01-01");\n');
			await writeFile(resolve(srcDir, 'call.ts'), 'const d = Date("2024-01-01");\n');

			const collector = new TSCollector({
				tsConfigFilePath: tsConfigPath,
				algorithmicPatterns: [
					{
						id: 'date-format',
						roles: ['parser'],
						matchers: [{ role: 'parser', functionPattern: '^Date$', literalArgIndex: 0, expressionKind: 'new' }],
					},
				],
			});
			newExprFacts = await collector.collect();
		});

		afterAll(async () => {
			await rm(tmpDir, { recursive: true, force: true });
		});

		test('emits bindings for matching new expressions', () => {
			const newBinding = newExprFacts.algorithmicBindings.find((b) => b.file.includes('parse'));
			const callBinding = newExprFacts.algorithmicBindings.find((b) => b.file.includes('call'));

			expect(newBinding).toBeDefined();
			expect(newBinding?.functionName).toBe('Date');
			expect(newBinding?.bindingKey).toBe('2024-01-01');
			expect(callBinding).toBeUndefined();
		});
	});

	describe('template-literal whitespace filtering', () => {
		const tmpDir = resolve(import.meta.dir, '../../../tests/fixtures/template-whitespace-test');
		let whitespaceFacts: TSCollectedFacts;

		beforeAll(async () => {
			const srcDir = resolve(tmpDir, 'src');
			await mkdir(srcDir, { recursive: true });
			const tsConfigPath = resolve(tmpDir, 'tsconfig.json');
			await writeFile(tsConfigPath, JSON.stringify({ compilerOptions: {} }));
			// biome-ignore lint/suspicious/noTemplateCurlyInString: writing TS source code as string literals
			await writeFile(resolve(srcDir, 'prefix.ts'), 'console.log(`\\n${heading}`);\n');
			// biome-ignore lint/suspicious/noTemplateCurlyInString: writing TS source code as string literals
			await writeFile(resolve(srcDir, 'suffix.ts'), 'proc.write(`${text}\\n`);\n');
			await writeFile(resolve(srcDir, 'split.ts'), 'const lines = buffer.split("\\n");\n');
			// biome-ignore lint/suspicious/noTemplateCurlyInString: writing TS source code as string literals
			await writeFile(resolve(srcDir, 'sep.ts'), 'const msg = `${header}\\n${body}`;\n');

			const collector = new TSCollector({
				tsConfigFilePath: tsConfigPath,
				algorithmicPatterns: [
					{
						id: 'pack-unpack',
						roles: ['packer', 'unpacker'],
						matchers: [
							{ role: 'packer', functionPattern: '^template-literal$', expressionKind: 'template' },
							{ role: 'unpacker', functionPattern: '\\.split$', literalArgIndex: 0 },
						],
					},
				],
			});
			whitespaceFacts = await collector.collect();
		});

		afterAll(async () => {
			await rm(tmpDir, { recursive: true, force: true });
		});

		test('does not emit bindings for whitespace-only prefix/suffix in template literals', () => {
			const prefixBinding = whitespaceFacts.algorithmicBindings.find((b) => b.file.includes('prefix'));
			const suffixBinding = whitespaceFacts.algorithmicBindings.find((b) => b.file.includes('suffix'));
			const splitBinding = whitespaceFacts.algorithmicBindings.find((b) => b.file.includes('split'));
			const sepBinding = whitespaceFacts.algorithmicBindings.find((b) => b.file.includes('sep'));

			expect(prefixBinding).toBeUndefined();
			expect(suffixBinding).toBeUndefined();
			expect(sepBinding).toBeDefined();
			expect(sepBinding?.bindingKey).toBe('\\n');
			expect(splitBinding).toBeDefined();
			expect(splitBinding?.bindingKey).toBe('\\n');
		});
	});
});

describe('TSCollector.collect() — callGraph fact', () => {
	test('provides callGraph in provideFacts', () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		expect(collector.provideFacts).toContain(CALL_GRAPH_CAPABILITY);
	});

	test('returns callGraph with expected structure', () => {
		expect(Array.isArray(sharedFacts.callGraph.nodes)).toBe(true);
		expect(Array.isArray(sharedFacts.callGraph.edges)).toBe(true);
	});
});
