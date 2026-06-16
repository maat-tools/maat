import { describe, expect, test } from 'bun:test';
import { Project } from 'ts-morph';
import { collectPositionalAccesses, collectPositionalSources } from './positional';

function projectFromSource(source: string, filePath = 'src/index.ts') {
	const project = new Project({ useInMemoryFileSystem: true });
	const sourceFile = project.createSourceFile(filePath, source);
	return { project, sourceFile, file: filePath };
}

function projectFromSources(files: Record<string, string>) {
	const project = new Project({ useInMemoryFileSystem: true });
	const entries = Object.entries(files);
	for (const [path, source] of entries) {
		project.createSourceFile(path, source);
	}
	const [firstPath] = entries[0] ?? ['src/index.ts'];
	return { project, sourceFile: project.getSourceFileOrThrow(firstPath), file: firstPath };
}

describe('collectPositionalSources()', () => {
	test('detects function returning tuple as positional source', () => {
		const { sourceFile, file } = projectFromSource(
			'export function getUserDetails(): [string, string, number, boolean] { return ["a", "b", 1, true]; }',
		);
		const [source] = collectPositionalSources(sourceFile, file);
		expect(source?.name).toBe('getUserDetails');
		expect(source?.isHeterogeneous).toBe(true);
		expect(source?.positions).toHaveLength(4);
		expect(source?.positions[0]).toEqual({ index: 0, type: 'string' });
		expect(source?.positions[3]).toEqual({ index: 3, type: 'boolean' });
	});

	test('detects array literal variable as positional source', () => {
		const { sourceFile, file } = projectFromSource('const config = ["admin", 8080, true];');
		const [source] = collectPositionalSources(sourceFile, file);
		expect(source?.name).toBe('config');
		expect(source?.isHeterogeneous).toBe(true);
	});

	test('propagates tuple source to variable assigned from function call', () => {
		const { sourceFile, file } = projectFromSource(`
			function getUserDetails(): [string, string, number, boolean] { return ["a", "b", 1, true]; }
			const user = getUserDetails();
		`);
		const sources = collectPositionalSources(sourceFile, file);
		const user = sources.find((s) => s.name === 'user');
		expect(user).toBeDefined();
		expect(user?.isHeterogeneous).toBe(true);
		expect(user?.positions).toHaveLength(4);
	});

	test('does not flag named object returns as positional source', () => {
		const { sourceFile, file } = projectFromSource('function getUserObject() { return { firstName: "Thomas" }; }');
		const sources = collectPositionalSources(sourceFile, file);
		expect(sources.some((s) => s.name === 'getUserObject')).toBe(false);
	});

	test('detects function returning array literal without explicit return type', () => {
		const { sourceFile, file } = projectFromSource(
			'function getUserDetailsImplicit() { return ["Thomas", "Richards", 1984, true]; }',
		);
		const [source] = collectPositionalSources(sourceFile, file);
		expect(source?.name).toBe('getUserDetailsImplicit');
		expect(source?.isHeterogeneous).toBe(true);
		expect(source?.positions).toHaveLength(4);
	});

	test('detects type-asserted array as positional source', () => {
		const { sourceFile, file } = projectFromSource(
			'const typedTuple = [1, "hello", true] as [number, string, boolean];',
		);
		const [source] = collectPositionalSources(sourceFile, file);
		expect(source?.name).toBe('typedTuple');
		expect(source?.isHeterogeneous).toBe(true);
		expect(source?.positions).toEqual([
			{ index: 0, type: 'number' },
			{ index: 1, type: 'string' },
			{ index: 2, type: 'boolean' },
		]);
	});

	test('widens literal types to base types for homogeneous check', () => {
		const { sourceFile, file } = projectFromSource("const homogeneousStrings = ['foo', 'bar', 'baz'];");
		const [source] = collectPositionalSources(sourceFile, file);
		expect(source?.name).toBe('homogeneousStrings');
		expect(source?.isHeterogeneous).toBe(false);
		expect(source?.positions).toEqual([
			{ index: 0, type: 'string' },
			{ index: 1, type: 'string' },
			{ index: 2, type: 'string' },
		]);
	});

	test('detects known positional API: split', () => {
		const { sourceFile, file } = projectFromSource('const dateParts = "2024-03-15".split("-");');
		const [source] = collectPositionalSources(sourceFile, file);
		expect(source?.name).toBe('dateParts');
	});

	test('detects known positional API: Object.values', () => {
		const { sourceFile, file } = projectFromSource('const values = Object.values({ a: 1 });');
		const [source] = collectPositionalSources(sourceFile, file);
		expect(source?.name).toBe('values');
	});

	test('detects known positional API: Object.entries', () => {
		const { sourceFile, file } = projectFromSource('const entries = Object.entries({ a: 1 });');
		const [source] = collectPositionalSources(sourceFile, file);
		expect(source?.name).toBe('entries');
	});

	test('detects class method with explicit tuple return type', () => {
		const { sourceFile, file } = projectFromSource(`
			class DataParser {
				parse(raw: string): [string, number, boolean] { return [raw, raw.length, raw.length > 0]; }
			}
		`);
		const source = collectPositionalSources(sourceFile, file).find((s) => s.name === 'DataParser.parse');
		expect(source).toBeDefined();
		expect(source?.isHeterogeneous).toBe(true);
		expect(source?.positions).toHaveLength(3);
		expect(source?.positions[1]).toEqual({ index: 1, type: 'number' });
	});

	test('each source has file, name, positions, and location', () => {
		const { sourceFile, file } = projectFromSource('const config = ["admin", 8080, true];');
		const [source] = collectPositionalSources(sourceFile, file);
		expect(source?.file).toBe(file);
		expect(typeof source?.name).toBe('string');
		expect(Array.isArray(source?.positions)).toBe(true);
		expect(source?.location.line).toBeGreaterThan(0);
	});
});

describe('collectPositionalAccesses()', () => {
	test('detects index access (user[3])', () => {
		const { sourceFile, file } = projectFromSource('const user = ["a", "b", 1, true]; const isAdmin = user[3];');
		const [access] = collectPositionalAccesses(sourceFile, file, '/');
		expect(access?.name).toBe('user');
		expect(access?.accessedIndex).toBe(3);
		expect(access?.accessKind).toBe('index');
	});

	test('detects array destructuring access', () => {
		const { sourceFile, file } = projectFromSource(
			'function getDetails(): [string, number] { return ["a", 1]; } const [first] = getDetails();',
		);
		const access = collectPositionalAccesses(sourceFile, file, '/').find(
			(a) => a.name === 'getDetails' && a.accessKind === 'destructuring',
		);
		expect(access).toBeDefined();
	});

	test('detects destructuring from variable', () => {
		const { sourceFile, file } = projectFromSource('const config = ["admin", 8080, true]; const [role] = config;');
		const access = collectPositionalAccesses(sourceFile, file, '/').find(
			(a) => a.name === 'config' && a.accessKind === 'destructuring',
		);
		expect(access).toBeDefined();
	});

	test('does not flag named property access', () => {
		const { sourceFile, file } = projectFromSource(
			'const namedUser = { firstName: "Thomas" }; const n = namedUser.firstName;',
		);
		const access = collectPositionalAccesses(sourceFile, file, '/').find((a) => a.name === 'namedUser');
		expect(access).toBeUndefined();
	});

	test('detects computed index access with variable', () => {
		const { sourceFile, file } = projectFromSource('const config = ["a", "b"]; const idx = 1; const v = config[idx];');
		const access = collectPositionalAccesses(sourceFile, file, '/').find(
			(a) => a.name === 'config' && a.accessedIndex === 'idx',
		);
		expect(access).toBeDefined();
	});

	test('detects computed index access with expression', () => {
		const { sourceFile, file } = projectFromSource(
			'const config = ["a", "b"]; const idx = 1; const v = config[idx + 1];',
		);
		const access = collectPositionalAccesses(sourceFile, file, '/').find(
			(a) => a.name === 'config' && a.accessedIndex === 'idx + 1',
		);
		expect(access).toBeDefined();
	});

	test('detects computed index access with function call', () => {
		const { sourceFile, file } = projectFromSource(
			'const config = ["a", "b"]; function getIndex() { return 2; } const v = config[getIndex()];',
		);
		const access = collectPositionalAccesses(sourceFile, file, '/').find(
			(a) => a.name === 'config' && a.accessedIndex === 'getIndex()',
		);
		expect(access).toBeDefined();
	});

	test('tracks cross-file origin for imported sources', () => {
		const { sourceFile, file } = projectFromSources({
			'src/remote.ts': `
				import { getUserDetails } from './positional';
				const remoteUser = getUserDetails();
				const isAdmin = remoteUser[3];
				const [first] = getUserDetails();
			`,
			'src/positional.ts': `
				export function getUserDetails(): [string, string, number, boolean] { return ["a", "b", 1, true]; }
			`,
		});
		const accesses = collectPositionalAccesses(sourceFile, file, '/');
		const indexAccess = accesses.find((a) => a.name === 'remoteUser');
		expect(indexAccess).toBeDefined();
		expect(indexAccess?.origin?.file).toBe('src/positional.ts');
		expect(indexAccess?.origin?.name).toBe('getUserDetails');

		const destructuringAccess = accesses.find((a) => a.name === 'getUserDetails' && a.accessKind === 'destructuring');
		expect(destructuringAccess).toBeDefined();
		expect(destructuringAccess?.origin?.file).toBe('src/positional.ts');
		expect(destructuringAccess?.origin?.name).toBe('getUserDetails');
	});

	test('each access has file, name, accessedIndex, and location', () => {
		const { sourceFile, file } = projectFromSource('const config = ["a"]; const v = config[0];');
		const [access] = collectPositionalAccesses(sourceFile, file, '/');
		expect(access?.file).toBe(file);
		expect(typeof access?.name).toBe('string');
		expect(typeof access?.accessedIndex).toBe('number');
		expect(access?.location.line).toBeGreaterThan(0);
	});
});
