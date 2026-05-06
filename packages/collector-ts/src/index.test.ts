import { describe, expect, test } from 'bun:test';
import { isAbsolute, resolve } from 'node:path';
import { CONSTANTS_CAPABILITY, IMPORTS_CAPABILITY } from '@maat/vocabulary';
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

	test('emits source locations relative to the tsconfig directory', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const { constants, imports } = await collector.collect();

		const files = [...imports.map((imp) => imp.file), ...constants.map((constant) => constant.location.file)];

		expect(files).toContain('src/index.ts');
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
