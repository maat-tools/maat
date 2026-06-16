import { describe, expect, test } from 'bun:test';
import type { AlgorithmicPattern } from '@maat-tools/vocabulary';
import { Project } from 'ts-morph';
import { collectAlgorithmicBindings } from './algorithmic-bindings';

function projectFromSource(source: string, filePath = 'src/index.ts') {
	const project = new Project({ useInMemoryFileSystem: true });
	const sourceFile = project.createSourceFile(filePath, source);
	return { project, sourceFile, file: filePath };
}

describe('collectAlgorithmicBindings()', () => {
	test('emits no bindings when no patterns configured', () => {
		const { sourceFile, file } = projectFromSource('const x = "a,b".split(",");');
		const bindings = collectAlgorithmicBindings(sourceFile, file, []);
		expect(bindings).toHaveLength(0);
	});

	test('emits bindings for matching call expressions', () => {
		const { sourceFile, file } = projectFromSource('const parts = "a,b".split(",");');
		const bindings = collectAlgorithmicBindings(sourceFile, file, [
			{
				id: 'pack-unpack',
				roles: ['packer', 'unpacker'],
				matchers: [
					{ role: 'packer', functionPattern: '\\.join$', literalArgIndex: 0 },
					{ role: 'unpacker', functionPattern: '\\.split$', literalArgIndex: 0 },
				],
			},
		]);
		expect(bindings.length).toBeGreaterThan(0);
		const splitBindings = bindings.filter((b) => b.functionName.includes('split'));
		expect(splitBindings.length).toBeGreaterThan(0);
		for (const b of splitBindings) {
			expect(b.patternId).toBe('pack-unpack');
			expect(b.role).toBe('unpacker');
			expect(typeof b.bindingKey).toBe('string');
			expect(b.file).not.toContain('\\');
			expect(b.location.line).toBeGreaterThan(0);
		}
	});

	test('does not emit bindings for non-matching functions', () => {
		const { sourceFile, file } = projectFromSource('doSomething("sha256");');
		const bindings = collectAlgorithmicBindings(sourceFile, file, [
			{
				id: 'hash-verify',
				roles: ['hasher'],
				matchers: [{ role: 'hasher', functionPattern: '^createHash$', literalArgIndex: 0 }],
			},
		]);
		expect(bindings).toHaveLength(0);
	});

	test('emits template-literal bindings when expressionKind is template', () => {
		// biome-ignore lint/suspicious/noTemplateCurlyInString: writing TS source code as string literals
		const { sourceFile, file } = projectFromSource('const msg = `${header}:${body}`;');
		const bindings = collectAlgorithmicBindings(sourceFile, file, [
			{
				id: 'pack-unpack',
				roles: ['packer', 'unpacker'],
				matchers: [
					{ role: 'packer', functionPattern: '^template-literal$', expressionKind: 'template' as const },
					{ role: 'unpacker', functionPattern: '\\.split$', literalArgIndex: 0 },
				],
			},
		] satisfies AlgorithmicPattern[]);
		const templateBindings = bindings.filter((b) => b.functionName === 'template-literal');
		expect(templateBindings.length).toBeGreaterThan(0);
		for (const b of templateBindings) {
			expect(b.patternId).toBe('pack-unpack');
			expect(b.role).toBe('packer');
		}
	});

	test('does not emit bindings for whitespace-only prefix/suffix in template literals', () => {
		const project = new Project({ useInMemoryFileSystem: true });
		// biome-ignore lint/suspicious/noTemplateCurlyInString: writing TS source code as string literals
		project.createSourceFile('src/prefix.ts', 'console.log(`\\n${heading}`);');
		// biome-ignore lint/suspicious/noTemplateCurlyInString: writing TS source code as string literals
		project.createSourceFile('src/suffix.ts', 'proc.write(`${text}\\n`);');
		project.createSourceFile('src/split.ts', 'const lines = buffer.split("\\n");');
		// biome-ignore lint/suspicious/noTemplateCurlyInString: writing TS source code as string literals
		project.createSourceFile('src/sep.ts', 'const msg = `${header}\\n${body}`;');

		const patterns = [
			{
				id: 'pack-unpack',
				roles: ['packer', 'unpacker'],
				matchers: [
					{ role: 'packer', functionPattern: '^template-literal$', expressionKind: 'template' as const },
					{ role: 'unpacker', functionPattern: '\\.split$', literalArgIndex: 0 },
				],
			},
		] satisfies AlgorithmicPattern[];

		const allBindings = project
			.getSourceFiles()
			.flatMap((sf) => collectAlgorithmicBindings(sf, sf.getFilePath(), patterns));

		const prefixBinding = allBindings.find((b) => b.file.includes('prefix'));
		const suffixBinding = allBindings.find((b) => b.file.includes('suffix'));
		const splitBinding = allBindings.find((b) => b.file.includes('split'));
		const sepBinding = allBindings.find((b) => b.file.includes('sep'));

		expect(prefixBinding).toBeUndefined();
		expect(suffixBinding).toBeUndefined();
		expect(sepBinding).toBeDefined();
		expect(sepBinding?.bindingKey).toBe('\\n');
		expect(splitBinding).toBeDefined();
		expect(splitBinding?.bindingKey).toBe('\\n');
	});

	test('records containingFunction for bindings inside functions', () => {
		const { sourceFile, file } = projectFromSource(`
			function parse() {
				const parts = "a,b".split(",");
			}
		`);
		const [binding] = collectAlgorithmicBindings(sourceFile, file, [
			{
				id: 'pack-unpack',
				roles: ['unpacker'],
				matchers: [{ role: 'unpacker', functionPattern: '\\.split$', literalArgIndex: 0 }],
			},
		]);
		expect(binding?.containingFunction).toBe('parse');
	});

	test('records containingFunction for class methods', () => {
		const { sourceFile, file } = projectFromSource(`
			class Parser {
				parse() {
					const parts = "a,b".split(",");
				}
			}
		`);
		const [binding] = collectAlgorithmicBindings(sourceFile, file, [
			{
				id: 'pack-unpack',
				roles: ['unpacker'],
				matchers: [{ role: 'unpacker', functionPattern: '\\.split$', literalArgIndex: 0 }],
			},
		]);
		expect(binding?.containingFunction).toBe('Parser.parse');
	});
});
