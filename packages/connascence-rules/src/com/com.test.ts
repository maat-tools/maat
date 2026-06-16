import { describe, expect, test } from 'bun:test';
import type { Constant } from '@maat-tools/vocabulary';
import { ConnascenceOfMeaningRule } from './com';

function makeConstant(overrides: Partial<Constant> = {}): Constant {
	return {
		file: '/src/index.ts',
		kind: 'string',
		value: 'ADMIN',
		location: { file: '/src/index.ts', line: 10, column: 5 },
		...overrides,
	};
}

function makeOccurrences(files: string[], value = 'ADMIN'): Constant[] {
	return files.map((file) => makeConstant({ file, value, location: { file, line: 1 } }));
}

// ── evaluate ─────────────────────────────────────────────────────────────────

describe('ConnascenceOfMeaningRule.evaluate()', () => {
	test('below threshold → no findings', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 3 });
		const findings = rule.evaluate({ constants: makeOccurrences(['/a.ts', '/b.ts']) });
		expect(findings).toHaveLength(0);
	});

	test('at threshold → finding produced', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 3 });
		const findings = rule.evaluate({ constants: makeOccurrences(['/a.ts', '/b.ts', '/c.ts']) });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('maat-tools/connascence-rules/com@v1');
	});

	test('above threshold → single finding with file count', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 2 });
		const findings = rule.evaluate({ constants: makeOccurrences(['/a.ts', '/b.ts', '/c.ts', '/d.ts']) });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('4 files');
	});

	test('duplicate files only count once toward threshold', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 3 });
		const findings = rule.evaluate({
			constants: makeOccurrences(['/a.ts', '/a.ts', '/a.ts', '/a.ts', '/a.ts']),
		});
		expect(findings).toHaveLength(0);
	});

	test('default threshold is 2', () => {
		const rule = new ConnascenceOfMeaningRule();
		const belowDefault = rule.evaluate({ constants: makeOccurrences(['/a.ts']) });
		expect(belowDefault).toHaveLength(0);
		const atDefault = rule.evaluate({ constants: makeOccurrences(['/a.ts', '/b.ts']) });
		expect(atDefault).toHaveLength(1);
	});

	test('custom ignoreValues excludes the value', () => {
		const rule = new ConnascenceOfMeaningRule({
			threshold: 2,
			ignoreValues: ['ADMIN'],
		});
		const findings = rule.evaluate({ constants: makeOccurrences(['/a.ts', '/b.ts', '/c.ts']) });
		expect(findings).toHaveLength(0);
	});

	test('ignoreValues only suppresses listed values', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 2, ignoreValues: ['OTHER'] });
		const findings = rule.evaluate({
			constants: [...makeOccurrences(['/a.ts', '/b.ts'], 'ADMIN'), ...makeOccurrences(['/c.ts', '/d.ts'], 'OTHER')],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ value: 'ADMIN' });
	});

	test('empty constants → no findings', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 1 });
		expect(rule.evaluate({ constants: [] })).toHaveLength(0);
	});

	test('threshold of 1 flags any single occurrence', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 1 });
		const findings = rule.evaluate({ constants: makeOccurrences(['/a.ts']) });
		expect(findings).toHaveLength(1);
	});

	test('finding message references distinct file count', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 3 });
		const findings = rule.evaluate({ constants: makeOccurrences(['/a.ts', '/b.ts', '/c.ts']) });
		expect(findings[0]?.message).toContain('3 files');
	});

	test('ruleIdentifier includes both value and kind', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 2 });
		const findings = rule.evaluate({ constants: makeOccurrences(['/a.ts', '/b.ts']) });
		expect(findings[0]?.ruleIdentifier).toEqual({ value: 'ADMIN', kind: 'string' });
	});

	test('same value with different kinds produces separate findings', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 2 });
		const constants = [
			makeConstant({ kind: 'string', value: '42', location: { file: '/a.ts', line: 1 } }),
			makeConstant({ kind: 'string', value: '42', location: { file: '/b.ts', line: 1 } }),
			makeConstant({ kind: 'number', value: '42', location: { file: '/a.ts', line: 2 } }),
			makeConstant({ kind: 'number', value: '42', location: { file: '/b.ts', line: 2 } }),
		];
		const findings = rule.evaluate({ constants });
		expect(findings).toHaveLength(2);
		const kinds = findings.map((f) => (f.ruleIdentifier as { kind: string }).kind).sort();
		expect(kinds).toEqual(['number', 'string']);
	});

	test('each occurrence produces one artifact', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 2 });
		const findings = rule.evaluate({ constants: makeOccurrences(['/a.ts', '/b.ts', '/c.ts']) });
		expect(findings[0]?.artifacts).toHaveLength(3);
	});

	test('multiple distinct values above threshold → multiple findings', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 2 });
		const findings = rule.evaluate({
			constants: [...makeOccurrences(['/a.ts', '/b.ts'], 'ADMIN'), ...makeOccurrences(['/c.ts', '/d.ts'], 'USER')],
		});
		expect(findings).toHaveLength(2);
	});

	test('missing constants capability → treated as empty', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 1 });
		const findings = rule.evaluate({ constants: undefined as unknown as Constant[] });
		expect(findings).toHaveLength(0);
	});
});

// ── describeArtifact ──────────────────────────────────────────────────────────

describe('ConnascenceOfMeaningRule.describeArtifact()', () => {
	const rule = new ConnascenceOfMeaningRule();

	test('source artifact with column → location includes column', () => {
		const c = makeConstant({ location: { file: '/src/auth.ts', line: 42, column: 7 } });
		const described = rule.describeArtifact({ kind: 'source', data: c });
		expect(described.location).toBe('/src/auth.ts:42:7');
		expect(described.value).toBe('ADMIN');
	});

	test('source artifact without column → location omits column', () => {
		const c = makeConstant({ location: { file: '/src/auth.ts', line: 42 } });
		const described = rule.describeArtifact({ kind: 'source', data: c });
		expect(described.location).toBe('/src/auth.ts:42');
	});

	test('unknown kind → returns stringified data', () => {
		const described = rule.describeArtifact({ kind: 'other', data: 'raw' });
		expect(described).toEqual({ value: 'raw' });
	});
});
