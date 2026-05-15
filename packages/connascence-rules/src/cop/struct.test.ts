import { describe, expect, test } from 'bun:test';
import type { PositionalAccess, PositionalSource } from '@maat-tools/vocabulary';
import { ConnascenceOfPositionStructRule } from './struct';

function makeSource(overrides: Partial<PositionalSource> = {}): PositionalSource {
	return {
		file: '/src/users.ts',
		variableName: 'user',
		positions: [
			{ index: 0, type: 'string' },
			{ index: 1, type: 'string' },
			{ index: 2, type: 'number' },
			{ index: 3, type: 'boolean' },
		],
		isHeterogeneous: true,
		location: { file: '/src/users.ts', line: 5, column: 2 },
		callSites: [],
		...overrides,
	};
}

function makeAccess(overrides: Partial<PositionalAccess> = {}): PositionalAccess {
	return {
		file: '/src/auth.ts',
		variableName: 'user',
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
		const source = makeSource({ variableName: 'data', file: '/src/users.ts' });
		const access = makeAccess({ variableName: 'data', file: '/src/users.ts' });
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('cop-struct@v1');
	});

	test('source and access in different files with no callSites → no finding', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const findings = rule.evaluate({
			positionalSources: [makeSource({ variableName: 'user', file: '/src/users.ts', callSites: [] })],
			positionalAccesses: [makeAccess({ variableName: 'user', file: '/src/auth.ts' })],
		});
		expect(findings).toHaveLength(0);
	});

	test('source and access with different variable names → no finding', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const findings = rule.evaluate({
			positionalSources: [makeSource({ variableName: 'user' })],
			positionalAccesses: [makeAccess({ variableName: 'data' })],
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
		const source = makeSource({ variableName: 'data', file: '/src/users.ts' });
		const access1 = makeAccess({ variableName: 'data', file: '/src/users.ts', accessedIndex: 0 });
		const access2 = makeAccess({ variableName: 'data', file: '/src/users.ts', accessedIndex: 3 });
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access1, access2],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.artifacts).toHaveLength(3);
	});

	test('multiple sources with their own accesses → multiple findings', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source1 = makeSource({ variableName: 'user', file: '/src/users.ts' });
		const source2 = makeSource({ variableName: 'config', file: '/src/config.ts' });
		const access1 = makeAccess({ variableName: 'user', file: '/src/users.ts' });
		const access2 = makeAccess({ variableName: 'config', file: '/src/config.ts' });
		const findings = rule.evaluate({
			positionalSources: [source1, source2],
			positionalAccesses: [access1, access2],
		});
		expect(findings).toHaveLength(2);
	});

	test('destructuring access is detected', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({ variableName: 'result', file: '/src/parser.ts' });
		const access = makeAccess({ variableName: 'result', file: '/src/parser.ts', accessKind: 'destructuring' });
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access],
		});
		expect(findings).toHaveLength(1);
	});

	test('cross-file: callSite in another file matches access there → finding produced', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({
			variableName: 'result',
			file: '/src/parser.ts',
			callSites: [
				{ file: '/src/consumer.ts', variableName: 'parsed', location: { file: '/src/consumer.ts', line: 3 } },
			],
		});
		const access = makeAccess({ variableName: 'parsed', file: '/src/consumer.ts', accessedIndex: 1 });
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('cop-struct@v1');
	});

	test('cross-file: multiple callSites each with an access → single finding with all artifacts', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({
			variableName: 'tuple',
			file: '/src/db.ts',
			callSites: [
				{ file: '/src/a.ts', variableName: 'row', location: { file: '/src/a.ts', line: 2 } },
				{ file: '/src/b.ts', variableName: 'entry', location: { file: '/src/b.ts', line: 5 } },
			],
		});
		const accessA = makeAccess({ variableName: 'row', file: '/src/a.ts', accessedIndex: 0 });
		const accessB = makeAccess({ variableName: 'entry', file: '/src/b.ts', accessedIndex: 1 });
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [accessA, accessB],
		});
		expect(findings).toHaveLength(1);
		// source artifact + 2 access artifacts
		expect(findings[0]?.artifacts).toHaveLength(3);
	});

	test('callSite present but no matching access → no finding', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({
			variableName: 'result',
			file: '/src/parser.ts',
			callSites: [
				{ file: '/src/consumer.ts', variableName: 'parsed', location: { file: '/src/consumer.ts', line: 3 } },
			],
		});
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [],
		});
		expect(findings).toHaveLength(0);
	});

	test('accessedIndex as string → finding produced and index appears in message', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({ variableName: 'pair', file: '/src/util.ts' });
		const access = makeAccess({ variableName: 'pair', file: '/src/util.ts', accessedIndex: '0' });
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('/src/util.ts[0]');
	});

	test('finding message references variable name and file', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({ variableName: 'data', file: '/src/users.ts' });
		const access = makeAccess({ variableName: 'data', file: '/src/users.ts' });
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access],
		});
		expect(findings[0]?.message).toContain('data');
		expect(findings[0]?.message).toContain('/src/users.ts');
	});

	test('ruleIdentifier includes variable name and file', () => {
		const rule = new ConnascenceOfPositionStructRule();
		const source = makeSource({ variableName: 'data', file: '/src/users.ts' });
		const access = makeAccess({ variableName: 'data', file: '/src/users.ts' });
		const findings = rule.evaluate({
			positionalSources: [source],
			positionalAccesses: [access],
		});
		expect(findings[0]?.ruleIdentifier).toHaveProperty('variable', 'data');
		expect(findings[0]?.ruleIdentifier).toHaveProperty('file', '/src/users.ts');
	});
});

describe('ConnascenceOfPositionStructRule.describeArtifact()', () => {
	const rule = new ConnascenceOfPositionStructRule();

	test('source artifact → describes structure', () => {
		const source = makeSource({
			variableName: 'user',
			file: '/src/users.ts',
			location: { file: '/src/users.ts', line: 5, column: 2 },
		});
		const described = rule.describeArtifact({ kind: 'source', data: source });
		expect(described.variable).toBe('user');
		expect(described.location).toBe('/src/users.ts:5:2');
		expect(described.role).toBe('Definition (source)');
	});

	test('access artifact → describes access pattern', () => {
		const access = makeAccess({
			variableName: 'user',
			file: '/src/auth.ts',
			accessedIndex: 3,
			accessKind: 'index',
			location: { file: '/src/auth.ts', line: 10, column: 5 },
		});
		const described = rule.describeArtifact({ kind: 'access', data: access });
		expect(described.variable).toBe('user');
		expect(described.location).toBe('/src/auth.ts:10:5');
		expect(described.index).toBe('3');
		expect(described.role).toBe('Usage (access)');
	});

	test('unknown kind → returns stringified data', () => {
		const described = rule.describeArtifact({ kind: 'other', data: 'raw' });
		expect(described).toEqual({ value: 'raw' });
	});
});
