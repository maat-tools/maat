import { describe, expect, test } from 'bun:test';
import { Project } from 'ts-morph';
import { collectFunctionSignatures } from './functions';

function projectFromSource(source: string) {
	const project = new Project({ useInMemoryFileSystem: true });
	const sourceFile = project.createSourceFile('src/index.ts', source);
	return { project, sourceFile, file: 'src/index.ts' };
}

describe('collectFunctionSignatures() — functions', () => {
	test('captures exported functions', () => {
		const { sourceFile, file } = projectFromSource(
			'export function greet(name: string): string { return "Hello, " + name + "!"; }',
		);
		const [fn] = collectFunctionSignatures(sourceFile, file);
		expect(fn).toBeDefined();
		expect(fn?.name).toBe('greet');
		expect(fn?.file).toBe(file);
		expect(fn?.exported).toBe(true);
	});

	test('captures non-exported functions', () => {
		const { sourceFile, file } = projectFromSource('function hidden(): void {}');
		const [fn] = collectFunctionSignatures(sourceFile, file);
		expect(fn?.name).toBe('hidden');
		expect(fn?.exported).toBe(false);
	});

	test('collects parameters with types and positions', () => {
		const { sourceFile, file } = projectFromSource(
			'export function sendEmail(firstName: string, lastName: string, email: string, subject: string, body: string): void {}',
		);
		const [fn] = collectFunctionSignatures(sourceFile, file);
		expect(fn?.input.parameters).toHaveLength(5);
		expect(fn?.input.parameters[0]).toEqual({ name: 'firstName', type: 'string', position: 0 });
		expect(fn?.input.parameters[4]).toEqual({ name: 'body', type: 'string', position: 4 });
	});

	test('flags homogeneous input types', () => {
		const { sourceFile, file } = projectFromSource(
			'export function sendEmail(firstName: string, lastName: string): void {}',
		);
		const [fn] = collectFunctionSignatures(sourceFile, file);
		expect(fn?.input.heterogeneous).toBe(false);
	});

	test('flags heterogeneous input types', () => {
		const { sourceFile, file } = projectFromSource(
			'export function createUser(name: string, email: string, age: number, isAdmin: boolean): void {}',
		);
		const [fn] = collectFunctionSignatures(sourceFile, file);
		expect(fn?.input.heterogeneous).toBe(true);
	});

	test('captures output returnType for void function', () => {
		const { sourceFile, file } = projectFromSource('export function noop(): void {}');
		const [fn] = collectFunctionSignatures(sourceFile, file);
		expect(fn?.output.returnType).toBe('void');
	});

	test('captures output returnType for union type', () => {
		const { sourceFile, file } = projectFromSource(`
			interface User { id: number; }
			export function findById(id: number): User | undefined { return undefined; }
		`);
		const [fn] = collectFunctionSignatures(sourceFile, file);
		expect(fn?.output.returnType).toContain('User | undefined');
	});

	test('flags output homogeneous for single return type', () => {
		const { sourceFile, file } = projectFromSource('export function greet(): string { return "hi"; }');
		const [fn] = collectFunctionSignatures(sourceFile, file);
		expect(fn?.output.heterogeneous).toBe(false);
		expect(fn?.output.returnType).toBe('string');
	});

	test('flags output heterogeneous for union return type', () => {
		const { sourceFile, file } = projectFromSource('export function maybe(): string | number { return 1; }');
		const [fn] = collectFunctionSignatures(sourceFile, file);
		expect(fn?.output.heterogeneous).toBe(true);
	});

	test('collects returnSites for function with return statement', () => {
		const { sourceFile, file } = projectFromSource('export function greet(): string { return "Hello, world!"; }');
		const [fn] = collectFunctionSignatures(sourceFile, file);
		expect(fn?.output.returnSites).toHaveLength(1);
		expect(fn?.output.returnSites[0]?.value).toContain('Hello,');
		expect(fn?.output.returnSites[0]?.location.line).toBeGreaterThan(0);
	});

	test('void functions have no returnSites', () => {
		const { sourceFile, file } = projectFromSource('export function noop(): void {}');
		const [fn] = collectFunctionSignatures(sourceFile, file);
		expect(fn?.output.returnSites).toHaveLength(0);
	});
});

describe('collectFunctionSignatures() — class methods', () => {
	test('captures public class methods', () => {
		const { sourceFile, file } = projectFromSource(`
			class UserService {
				findById(id: number): User | undefined { return undefined; }
			}
		`);
		const [fn] = collectFunctionSignatures(sourceFile, file);
		expect(fn?.name).toBe('UserService.findById');
		expect(fn?.exported).toBe(true);
	});

	test('captures private class methods as non-exported', () => {
		const { sourceFile, file } = projectFromSource(`
			class UserService {
				private helper(): void {}
			}
		`);
		const [fn] = collectFunctionSignatures(sourceFile, file);
		expect(fn?.name).toBe('UserService.helper');
		expect(fn?.exported).toBe(false);
	});

	test('collects method parameters', () => {
		const { sourceFile, file } = projectFromSource(`
			class UserService {
				findById(id: number): User | undefined { return undefined; }
			}
		`);
		const [fn] = collectFunctionSignatures(sourceFile, file);
		expect(fn?.input.parameters).toEqual([{ name: 'id', type: 'number', position: 0 }]);
	});

	test('collects method returnSites', () => {
		const { sourceFile, file } = projectFromSource(`
			class UserService {
				findById(id: number): User | undefined { return this.users.find((u) => u.id === id); }
			}
		`);
		const [fn] = collectFunctionSignatures(sourceFile, file);
		expect(fn?.output.returnSites).toHaveLength(1);
	});
});
