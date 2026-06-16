import { describe, expect, test } from 'bun:test';
import { Project } from 'ts-morph';
import { collectConstants } from './constants';

function projectFromSource(source: string) {
	const project = new Project({ useInMemoryFileSystem: true });
	const sourceFile = project.createSourceFile('src/index.ts', source);
	return { project, sourceFile, file: 'src/index.ts' };
}

describe('collectConstants()', () => {
	test('captures string literals', () => {
		const { sourceFile, file } = projectFromSource('const name = "Alice";');
		const [constant] = collectConstants(sourceFile, file);
		expect(constant).toBeDefined();
		expect(constant?.kind).toBe('string');
		expect(constant?.value).toBe('Alice');
		expect(constant?.file).toBe(file);
	});

	test('captures numeric literals', () => {
		const { sourceFile, file } = projectFromSource('const age = 42;');
		const [constant] = collectConstants(sourceFile, file);
		expect(constant).toBeDefined();
		expect(constant?.kind).toBe('number');
		expect(constant?.value).toBe('42');
	});

	test('skips import specifiers', () => {
		const { sourceFile, file } = projectFromSource("import { foo } from './foo';");
		const constants = collectConstants(sourceFile, file);
		expect(constants).toHaveLength(0);
	});

	test('skips export specifiers', () => {
		const { sourceFile, file } = projectFromSource("export { foo } from './foo';");
		const constants = collectConstants(sourceFile, file);
		expect(constants).toHaveLength(0);
	});

	test('skips string literals compared to typeof expressions', () => {
		const { sourceFile, file } = projectFromSource('const t = typeof x === "string";');
		const constants = collectConstants(sourceFile, file);
		expect(constants).toHaveLength(0);
	});

	test('captures string literals used as function arguments', () => {
		const { sourceFile, file } = projectFromSource('console.log("hello");');
		const [constant] = collectConstants(sourceFile, file);
		expect(constant?.value).toBe('hello');
	});

	test('captures string literals in return statements', () => {
		const { sourceFile, file } = projectFromSource('function greet() { return "hi"; }');
		const constants = collectConstants(sourceFile, file);
		expect(constants.some((c) => c.value === 'hi')).toBe(true);
	});

	test('records location for each constant', () => {
		const { sourceFile, file } = projectFromSource('const name = "Alice";');
		const [constant] = collectConstants(sourceFile, file);
		expect(constant?.location.file).toBe(file);
		expect(constant?.location.line).toBe(1);
	});
});
