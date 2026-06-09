import { describe, expect, test } from 'bun:test';
import type { Constant } from '@maat-tools/vocabulary';
import { ConnascenceOfMeaningRule } from './com/com';

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

	test('finding produced without flow path info', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 2 });
		const findings = rule.evaluate({ constants: makeOccurrences(['/a.ts', '/b.ts']) });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).not.toContain('flow paths');
	});

	test('all occurrences count regardless of syntactic position', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 2 });
		const constants = makeOccurrences(['/a.ts', '/b.ts', '/c.ts']);
		const findings = rule.evaluate({ constants });
		expect(findings).toHaveLength(1);
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
