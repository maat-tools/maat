import { describe, expect, test } from 'bun:test';
import type { PositionalAccess, PositionalSource } from '@maat-tools/vocabulary';
import { ConnascenceOfPositionStructRule } from './struct';

function makeSource(overrides: Partial<PositionalSource> = {}): PositionalSource {
	return {
		file: '/src/users.ts',
		name: 'user',
		type: 'variable',
		positions: [
			{ index: 0, type: 'string' },
			{ index: 1, type: 'string' },
			{ index: 2, type: 'number' },
			{ index: 3, type: 'boolean' },
		],
		isHeterogeneous: true,
		location: { file: '/src/users.ts', line: 5, column: 2 },
		...overrides,
	};
}

function makeAccess(overrides: Partial<PositionalAccess> = {}): PositionalAccess {
	return {
		file: '/src/auth.ts',
		name: 'user',
		type: 'variable',
		accessedIndex: 3,
		accessKind: 'index',
		location: { file: '/src/auth.ts', line: 10, column: 5 },
		...overrides,
	};
}

describe('ConnascenceOfPositionStructRule.evaluate()', () => {
	test('no sources, no accesses → no findings', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const findings = rule.evaluate({ positionalSources: [], positionalAccesses: [] });
		expect(findings).toHaveLength(0);
	});

	test('source with no matching access → no finding', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const findings = rule.evaluate({
			positionalSources: [makeSource()],
			positionalAccesses: [],
		});
		expect(findings).toHaveLength(0);
	});

	test('access with no matching source → no finding', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const findings = rule.evaluate({
			positionalSources: [],
			positionalAccesses: [makeAccess()],
		});
		expect(findings).toHaveLength(0);
	});

	test('source and access with same variable in same file → finding produced', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({ name: 'data', file: '/src/users.ts' });
		const access = makeAccess({ name: 'data', file: '/src/users.ts' });
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('maat-tools/connascence-rules/cop-struct@v1');
	});

	test('source and access in different files with no origin → no finding', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const findings = rule.evaluate({
			positionalSources: [makeSource({ name: 'user', file: '/src/users.ts' })],
			positionalAccesses: [makeAccess({ name: 'user', file: '/src/auth.ts' })],
		});
		expect(findings).toHaveLength(0);
	});

	test('source and access with different variable names → no finding', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const findings = rule.evaluate({
			positionalSources: [makeSource({ name: 'user' })],
			positionalAccesses: [makeAccess({ name: 'data' })],
		});
		expect(findings).toHaveLength(0);
	});

	test('homogeneous source with onlyHeterogeneous: true → no finding', () => {
		const rule = new ConnascenceOfPositionStructRule({ onlyHeterogeneous: true });
		const source = makeSource({ isHeterogeneous: false });
		const access = makeAccess({ file: source.file });
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access],
		});
		expect(findings).toHaveLength(0);
	});

	test('homogeneous source with onlyHeterogeneous: false → finding produced', () => {
		const rule = new ConnascenceOfPositionStructRule({ onlyHeterogeneous: false });
		const source = makeSource({ isHeterogeneous: false });
		const access = makeAccess({ file: source.file });
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access],
		});
		expect(findings).toHaveLength(1);
	});

	test('multiple accesses to same source → single finding with all artifacts', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({ name: 'data', file: '/src/users.ts' });
		const access1 = makeAccess({ name: 'data', file: '/src/users.ts', accessedIndex: 0 });
		const access2 = makeAccess({ name: 'data', file: '/src/users.ts', accessedIndex: 3 });
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access1, access2],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.artifacts).toHaveLength(3);
	});

	test('multiple sources with their own accesses → multiple findings', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source1 = makeSource({ name: 'user', file: '/src/users.ts' });
		const source2 = makeSource({ name: 'config', file: '/src/config.ts' });
		const access1 = makeAccess({ name: 'user', file: '/src/users.ts' });
		const access2 = makeAccess({ name: 'config', file: '/src/config.ts' });
		const findings = rule.evaluate({
			positionalSources: [source1, source2],
			positionalAccesses: [access1, access2],
		});
		expect(findings).toHaveLength(2);
	});

	test('destructuring access is detected', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({ name: 'result', file: '/src/parser.ts' });
		const access = makeAccess({ name: 'result', file: '/src/parser.ts', accessKind: 'destructuring' });
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access],
		});
		expect(findings).toHaveLength(1);
	});

	test('cross-file: access with origin matching source → finding produced', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({
			name: 'result',
			file: '/src/parser.ts',
			location: { file: '/src/parser.ts', line: 10, column: 0 },
		});
		const access = makeAccess({
			name: 'parsed',
			file: '/src/consumer.ts',
			accessedIndex: 1,
			origin: { file: '/src/parser.ts', name: 'result' },
			location: { file: '/src/consumer.ts', line: 3, column: 2 },
		});
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('maat-tools/connascence-rules/cop-struct@v1');
	});

	test('cross-file: multiple accesses with same origin → single finding with all artifacts', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({
			name: 'tuple',
			file: '/src/db.ts',
			location: { file: '/src/db.ts', line: 5, column: 0 },
		});
		const accessA = makeAccess({
			name: 'row',
			file: '/src/a.ts',
			accessedIndex: 0,
			origin: { file: '/src/db.ts', name: 'tuple' },
			location: { file: '/src/a.ts', line: 2, column: 1 },
		});
		const accessB = makeAccess({
			name: 'entry',
			file: '/src/b.ts',
			accessedIndex: 1,
			origin: { file: '/src/db.ts', name: 'tuple' },
			location: { file: '/src/b.ts', line: 5, column: 3 },
		});
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [accessA, accessB],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.artifacts).toHaveLength(3);
	});

	test('access with origin that has no matching source → no finding', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({ name: 'result', file: '/src/parser.ts' });
		const access = makeAccess({
			name: 'other',
			file: '/src/consumer.ts',
			origin: { file: '/src/parser.ts', name: 'differentName' },
		});
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access],
		});
		expect(findings).toHaveLength(0);
	});

	test('accessedIndex as string → finding produced', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({ name: 'pair', file: '/src/util.ts' });
		const access = makeAccess({ name: 'pair', file: '/src/util.ts', accessedIndex: '0' });
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('pair');
		expect(findings[0]?.message).toContain('/src/util.ts');
	});

	test('finding message references variable name and file', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({ name: 'data', file: '/src/users.ts' });
		const access = makeAccess({ name: 'data', file: '/src/users.ts' });
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access],
		});
		expect(findings[0]?.message).toContain('data');
		expect(findings[0]?.message).toContain('/src/users.ts');
	});

	test('ruleIdentifier includes variable name and file', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({ name: 'data', file: '/src/users.ts' });
		const access = makeAccess({ name: 'data', file: '/src/users.ts' });
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access],
		});
		expect(findings[0]?.ruleIdentifier).toHaveProperty('name', 'data');
		expect(findings[0]?.ruleIdentifier).toHaveProperty('file', '/src/users.ts');
	});

	test('source with empty positions but heterogeneous flag is still evaluated', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({ name: 'data', positions: [], isHeterogeneous: true });
		const access = makeAccess({ name: 'data', file: source.file, accessedIndex: 0 });
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access],
		});
		expect(findings).toHaveLength(1);
	});

	test('cross-file access with origin matching source file but wrong name → no finding', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({ name: 'result', file: '/src/parser.ts' });
		const access = makeAccess({
			name: 'parsed',
			file: '/src/consumer.ts',
			origin: { file: '/src/parser.ts', name: 'differentName' },
		});
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access],
		});
		expect(findings).toHaveLength(0);
	});

	test('missing positional facts capabilities → treated as empty', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const findings = rule.evaluate({
			positionalSources: undefined as unknown as PositionalSource[],
			positionalAccesses: undefined as unknown as PositionalAccess[],
		});
		expect(findings).toHaveLength(0);
	});
});

describe('ConnascenceOfPositionStructRule.describeArtifact()', () => {
	const rule = new ConnascenceOfPositionStructRule();

	test('source artifact → describes structure', () => {
		const source = makeSource({
			name: 'user',
			file: '/src/users.ts',
			location: { file: '/src/users.ts', line: 5, column: 2 },
		});
		const described = rule.describeArtifact({ kind: 'source', data: source });
		expect(described.identifier).toBe('user');
		expect(described.location).toBe('/src/users.ts:5:2');
		expect(described.role).toBe('[Source]');
	});

	test('access artifact → describes access pattern', () => {
		const access = makeAccess({
			name: 'user',
			file: '/src/auth.ts',
			accessedIndex: 3,
			accessKind: 'index',
			location: { file: '/src/auth.ts', line: 10, column: 5 },
		});
		const described = rule.describeArtifact({ kind: 'access', data: access });
		expect(described.identifier).toBe('user');
		expect(described.location).toBe('/src/auth.ts:10:5');
		expect(described.index).toBe('3');
		expect(described.role).toBe('[Access]');
	});

	test('unknown kind → returns stringified data', () => {
		const described = rule.describeArtifact({ kind: 'other', data: 'raw' });
		expect(described).toEqual({ value: 'raw' });
	});
});
