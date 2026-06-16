import { describe, expect, test } from 'bun:test';
import type { AlgorithmicBinding } from '@maat-tools/vocabulary';
import { ConnascenceOfAlgorithmTechnicalRule } from './technical';

function makeBinding(
	patternId: string,
	role: string,
	bindingKey: string,
	overrides: Partial<Omit<AlgorithmicBinding, 'patternId' | 'role' | 'bindingKey'>> = {},
): AlgorithmicBinding {
	return {
		patternId,
		role,
		bindingKey,
		functionName: 'testFn',
		file: 'test.ts',
		location: { file: 'test.ts', line: 1 },
		containingFunction: null,
		...overrides,
	};
}

describe('ConnascenceOfAlgorithmTechnicalRule', () => {
	test('no bindings → no findings', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule();
		const findings = rule.evaluate({ algorithmicBindings: [] });
		expect(findings).toHaveLength(0);
	});

	test('single role across multiple files → no finding when requireCompletePair=true', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule();
		const bindings: AlgorithmicBinding[] = [
			makeBinding('pack-unpack', 'packer', ':', { file: 'a.ts' }),
			makeBinding('pack-unpack', 'packer', ':', { file: 'b.ts' }),
		];
		const findings = rule.evaluate({ algorithmicBindings: bindings });
		expect(findings).toHaveLength(0);
	});

	test('two roles in one file → no finding when minFiles=2', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule();
		const bindings: AlgorithmicBinding[] = [
			makeBinding('pack-unpack', 'packer', ':', { file: 'a.ts' }),
			makeBinding('pack-unpack', 'unpacker', ':', { file: 'a.ts' }),
		];
		const findings = rule.evaluate({ algorithmicBindings: bindings });
		expect(findings).toHaveLength(0);
	});

	test('two roles across two files → finding', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule();
		const bindings: AlgorithmicBinding[] = [
			makeBinding('pack-unpack', 'packer', ':', { file: 'a.ts' }),
			makeBinding('pack-unpack', 'unpacker', ':', { file: 'b.ts' }),
		];
		const findings = rule.evaluate({ algorithmicBindings: bindings });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('pack-unpack');
		expect(findings[0]?.message).toContain(':');
		expect(findings[0]?.artifacts).toHaveLength(2);
	});

	test('patterns option filters unrelated pattern ids', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule({ patterns: ['pack-unpack'] });
		const bindings: AlgorithmicBinding[] = [
			makeBinding('pack-unpack', 'packer', ':', { file: 'a.ts' }),
			makeBinding('pack-unpack', 'unpacker', ':', { file: 'b.ts' }),
			makeBinding('hash-verify', 'hasher', 'sha256', { file: 'c.ts' }),
			makeBinding('hash-verify', 'hasher', 'sha256', { file: 'd.ts' }),
		];
		const findings = rule.evaluate({ algorithmicBindings: bindings });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('pack-unpack');
	});

	test('requireCompletePair=false allows single-role findings across files', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule({ requireCompletePair: false });
		const bindings: AlgorithmicBinding[] = [
			makeBinding('hash-verify', 'hasher', 'sha256', { file: 'a.ts' }),
			makeBinding('hash-verify', 'hasher', 'sha256', { file: 'b.ts' }),
		];
		const findings = rule.evaluate({ algorithmicBindings: bindings });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('sha256');
	});

	test('bindingKey containing delimiter "::" is preserved correctly', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule();
		const bindings: AlgorithmicBinding[] = [
			makeBinding('pack-unpack', 'packer', '::', { file: 'a.ts' }),
			makeBinding('pack-unpack', 'unpacker', '::', { file: 'b.ts' }),
		];
		const findings = rule.evaluate({ algorithmicBindings: bindings });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('pack-unpack');
		expect(findings[0]?.message).toContain('::');
		expect(findings[0]?.message).not.toContain('""');
	});

	test('requireSameContainer=true suppresses finding when roles are in different containers', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule({ requireSameContainer: true });
		const bindings: AlgorithmicBinding[] = [
			makeBinding('pack-unpack', 'packer', ':', { file: 'a.ts', containingFunction: 'buildKey' }),
			makeBinding('pack-unpack', 'unpacker', ':', { file: 'b.ts', containingFunction: 'parseKey' }),
		];
		const findings = rule.evaluate({ algorithmicBindings: bindings });
		expect(findings).toHaveLength(0);
	});

	test('requireSameContainer=true allows finding when roles share the same containingFunction', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule({ requireSameContainer: true, minFiles: 1 });
		const bindings: AlgorithmicBinding[] = [
			makeBinding('pack-unpack', 'packer', ':', { file: 'a.ts', containingFunction: 'CacheService.buildKey' }),
			makeBinding('pack-unpack', 'unpacker', ':', { file: 'a.ts', containingFunction: 'CacheService.buildKey' }),
		];
		const findings = rule.evaluate({ algorithmicBindings: bindings });
		expect(findings).toHaveLength(1);
	});

	test('requireSameContainer=true falls back to file when containingFunction is null', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule({ requireSameContainer: true, minFiles: 1 });
		const bindings: AlgorithmicBinding[] = [
			makeBinding('pack-unpack', 'packer', ':', { file: 'cache.ts', containingFunction: null }),
			makeBinding('pack-unpack', 'unpacker', ':', { file: 'cache.ts', containingFunction: null }),
		];
		const findings = rule.evaluate({ algorithmicBindings: bindings });
		expect(findings).toHaveLength(1);
	});

	test('requireSameContainer=true works across different files when container is shared', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule({ requireSameContainer: true });
		const bindings: AlgorithmicBinding[] = [
			makeBinding('pack-unpack', 'packer', ':', { file: 'a.ts', containingFunction: 'CacheService.buildKey' }),
			makeBinding('pack-unpack', 'unpacker', ':', { file: 'b.ts', containingFunction: 'CacheService.buildKey' }),
		];
		const findings = rule.evaluate({ algorithmicBindings: bindings });
		expect(findings).toHaveLength(1);
	});

	test('default ignoreBindingKeys suppresses universal separators (/, \\, ,) automatically', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule({ minFiles: 1 });
		for (const sep of ['/', '\\', ',']) {
			const bindings: AlgorithmicBinding[] = [
				makeBinding('pack-unpack', 'packer', sep, { file: 'a.ts' }),
				makeBinding('pack-unpack', 'unpacker', sep, { file: 'b.ts' }),
			];
			const findings = rule.evaluate({ algorithmicBindings: bindings });
			expect(findings).toHaveLength(0);
		}
	});

	test('custom ignoreBindingKeys suppresses configured invariants', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule({ ignoreBindingKeys: ['::', '—'] });
		const bindings: AlgorithmicBinding[] = [
			makeBinding('pack-unpack', 'packer', '::', { file: 'a.ts' }),
			makeBinding('pack-unpack', 'unpacker', '::', { file: 'b.ts' }),
		];
		const findings = rule.evaluate({ algorithmicBindings: bindings });
		expect(findings).toHaveLength(0);
	});

	test('ignoreBindingKeys does not affect unlisted invariants', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule({ ignoreBindingKeys: ['::'] });
		const bindings: AlgorithmicBinding[] = [
			makeBinding('pack-unpack', 'packer', ':', { file: 'a.ts' }),
			makeBinding('pack-unpack', 'unpacker', ':', { file: 'b.ts' }),
		];
		const findings = rule.evaluate({ algorithmicBindings: bindings });
		expect(findings).toHaveLength(1);
	});

	test('describeArtifact formats binding correctly', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule();
		const desc = rule.describeArtifact({
			kind: 'algorithmicBinding',
			data: makeBinding('pack-unpack', 'packer', ':', {
				functionName: 'join',
				file: 'cache.ts',
				location: { file: 'cache.ts', line: 3, column: 5 },
				containingFunction: 'CacheService.buildKey',
			}),
		});
		expect(desc.location).toBe('cache.ts:3:5');
		expect(desc.role).toBe('packer');
		expect(desc.pattern).toBe('pack-unpack');
		expect(desc.invariant).toBe(':');
		expect(desc.function).toBe('join');
		expect(desc.container).toBe('CacheService.buildKey');
	});

	test('describeArtifact shows module-level when containingFunction is null', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule();
		const desc = rule.describeArtifact({
			kind: 'algorithmicBinding',
			data: makeBinding('pack-unpack', 'packer', ':', {
				containingFunction: null,
			}),
		});
		expect(desc.container).toBe('(module-level)');
	});

	test('minFiles=0 flags a complete pair in a single file', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule({ minFiles: 0 });
		const bindings: AlgorithmicBinding[] = [
			makeBinding('pack-unpack', 'packer', ':', { file: 'a.ts' }),
			makeBinding('pack-unpack', 'unpacker', ':', { file: 'a.ts' }),
		];
		const findings = rule.evaluate({ algorithmicBindings: bindings });
		expect(findings).toHaveLength(1);
	});

	test('empty patterns option filters every pattern id', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule({ patterns: [] });
		const bindings: AlgorithmicBinding[] = [
			makeBinding('pack-unpack', 'packer', ':', { file: 'a.ts' }),
			makeBinding('pack-unpack', 'unpacker', ':', { file: 'b.ts' }),
		];
		const findings = rule.evaluate({ algorithmicBindings: bindings });
		expect(findings).toHaveLength(0);
	});

	test('missing algorithmicBindings capability → treated as empty', () => {
		const rule = new ConnascenceOfAlgorithmTechnicalRule();
		const findings = rule.evaluate({
			algorithmicBindings: undefined as unknown as AlgorithmicBinding[],
		});
		expect(findings).toHaveLength(0);
	});
});
