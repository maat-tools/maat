import { describe, expect, test } from 'bun:test';
import { Project } from 'ts-morph';
import { makeLocation } from './utils';

describe('makeLocation()', () => {
	test('returns file, line, and column for a node', () => {
		const project = new Project({ useInMemoryFileSystem: true });
		const sourceFile = project.createSourceFile('src/index.ts', 'const x = 1;');
		const node = sourceFile.getVariableDeclaration('x');
		if (!node) {
			throw new Error('expected a variable declaration');
		}
		const location = makeLocation('src/index.ts', node);
		expect(location.file).toBe('src/index.ts');
		expect(location.line).toBe(1);
		expect(typeof location.column).toBe('number');
	});
});
