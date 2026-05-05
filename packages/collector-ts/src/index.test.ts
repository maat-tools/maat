import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { TSCollector } from './index';

const TSCONFIG = resolve(
	import.meta.dir,
	'../fixtures/sample-project/tsconfig.json',
);

describe('TSCollector', () => {
	test('id is "ts"', () => {
		const collector = new TSCollector({ tsConfigFilePath: TSCONFIG });
		expect(collector.id).toBe('ts');
	});

	test('provideFacts contains "constants"', () => {
		const collector = new TSCollector({ tsConfigFilePath: TSCONFIG });
		expect(collector.provideFacts).toContain('constants');
	});

	test('collect() returns a non-empty constants array', async () => {
		const collector = new TSCollector({ tsConfigFilePath: TSCONFIG });
		const { constants } = await collector.collect();
		expect(constants.length).toBeGreaterThan(0);
	});

	test('string literals have kind "string" and value without quotes', async () => {
		const collector = new TSCollector({ tsConfigFilePath: TSCONFIG });
		const { constants } = await collector.collect();
		const strings = constants.filter((c) => c.kind === 'string');
		expect(strings.length).toBeGreaterThan(0);
		for (const c of strings) {
			expect(c.value).not.toMatch(/^['"`]/);
		}
	});

	test('numeric literals have kind "number"', async () => {
		const collector = new TSCollector({ tsConfigFilePath: TSCONFIG });
		const { constants } = await collector.collect();
		const numbers = constants.filter((c) => c.kind === 'number');
		expect(numbers.length).toBeGreaterThan(0);
	});

	test('import paths have context "import"', async () => {
		const collector = new TSCollector({ tsConfigFilePath: TSCONFIG });
		const { constants } = await collector.collect();
		const importConsts = constants.filter((c) => c.context === 'import');
		// both index.ts and permissions.ts import from './user'
		expect(importConsts.length).toBeGreaterThanOrEqual(2);
		expect(importConsts.every((c) => c.value.startsWith('.'))).toBe(true);
	});

	test('constructor arguments have context "argument"', async () => {
		const collector = new TSCollector({ tsConfigFilePath: TSCONFIG });
		const { constants } = await collector.collect();
		// new UserService('admin') in index.ts
		const adminArg = constants.find(
			(c) => c.kind === 'string' && c.value === 'admin' && c.context === 'argument',
		);
		expect(adminArg).toBeDefined();
	});

	test('call expression arguments have context "argument"', async () => {
		const collector = new TSCollector({ tsConfigFilePath: TSCONFIG });
		const { constants } = await collector.collect();
		// service.findById(1) in index.ts
		const oneArg = constants.find(
			(c) => c.kind === 'number' && c.value === '1' && c.context === 'argument',
		);
		expect(oneArg).toBeDefined();
	});

	test('object property values have context "assignment"', async () => {
		const collector = new TSCollector({ tsConfigFilePath: TSCONFIG });
		const { constants } = await collector.collect();
		// { name: 'Alice', ... } in index.ts
		const alice = constants.find(
			(c) => c.kind === 'string' && c.value === 'Alice' && c.context === 'assignment',
		);
		expect(alice).toBeDefined();
	});

	test('every constant has a location with file, line, and column', async () => {
		const collector = new TSCollector({ tsConfigFilePath: TSCONFIG });
		const { constants } = await collector.collect();
		for (const c of constants) {
			expect(typeof c.location.file).toBe('string');
			expect(c.location.file.length).toBeGreaterThan(0);
			expect(typeof c.location.line).toBe('number');
			expect(c.location.line).toBeGreaterThan(0);
			expect(typeof c.location.column).toBe('number');
		}
	});

	test('location file paths are absolute paths to fixture files', async () => {
		const collector = new TSCollector({ tsConfigFilePath: TSCONFIG });
		const { constants } = await collector.collect();
		const files = new Set(constants.map((c) => c.location.file));
		expect([...files].every((f) => f.startsWith('/'))).toBe(true);
	});

	test('raw preserves the original source text including quotes for strings', async () => {
		const collector = new TSCollector({ tsConfigFilePath: TSCONFIG });
		const { constants } = await collector.collect();
		const strings = constants.filter((c) => c.kind === 'string');
		for (const c of strings) {
			// raw should be the full token including delimiters
			expect(c.raw.length).toBeGreaterThan(c.value.length);
		}
	});
});
