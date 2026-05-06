import { describe, expect, test } from 'bun:test';
import type { Constant } from '@maat/vocabulary';
import { ConnascenceOfMeaningRule } from './com';

function makeConstant(overrides: Partial<Constant> = {}): Constant {
	return {
		kind: 'string',
		value: 'ADMIN',
		raw: '"ADMIN"',
		context: 'assignment',
		location: { file: '/src/index.ts', line: 10, column: 5 },
		...overrides,
	};
}

function makeOccurrences(files: string[], value = 'ADMIN'): Constant[] {
	return files.map((file) =>
		makeConstant({ value, raw: `"${value}"`, location: { file, line: 1 } }),
	);
}

// ── evaluate ─────────────────────────────────────────────────────────────────

describe('ConnascenceOfMeaningRule.evaluate()', () => {
	test('below threshold → no findings', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 3 });
		const findings = rule.evaluate({
			constants: makeOccurrences(['/a.ts', '/b.ts']),
		});
		expect(findings).toHaveLength(0);
	});

	test('at threshold → finding produced', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 3 });
		const findings = rule.evaluate({
			constants: makeOccurrences(['/a.ts', '/b.ts', '/c.ts']),
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('com@v1');
	});

	test('duplicate files only count once toward threshold', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 3 });
		// same file repeated 5 times — still only 1 distinct file
		const findings = rule.evaluate({
			constants: makeOccurrences(['/a.ts', '/a.ts', '/a.ts', '/a.ts', '/a.ts']),
		});
		expect(findings).toHaveLength(0);
	});

	test('noise values are ignored', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 2 });
		const findings = rule.evaluate({
			constants: makeOccurrences(['/a.ts', '/b.ts', '/c.ts'], 'true'),
		});
		expect(findings).toHaveLength(0);
	});

	test('import context is ignored', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 2 });
		const constants = makeOccurrences(['/a.ts', '/b.ts', '/c.ts']).map((c) => ({
			...c,
			context: 'import' as const,
		}));
		const findings = rule.evaluate({ constants });
		expect(findings).toHaveLength(0);
	});

	test('custom ignoreValues excludes the value', () => {
		const rule = new ConnascenceOfMeaningRule({
			threshold: 2,
			ignoreValues: ['ADMIN'],
		});
		const findings = rule.evaluate({
			constants: makeOccurrences(['/a.ts', '/b.ts', '/c.ts']),
		});
		expect(findings).toHaveLength(0);
	});

	test('finding message references distinct file count', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 3 });
		const findings = rule.evaluate({
			constants: makeOccurrences(['/a.ts', '/b.ts', '/c.ts']),
		});
		expect(findings[0]?.message).toContain('3 files');
	});

	test('each occurrence produces one artifact', () => {
		const rule = new ConnascenceOfMeaningRule({ threshold: 2 });
		const findings = rule.evaluate({
			constants: makeOccurrences(['/a.ts', '/b.ts', '/c.ts']),
		});
		expect(findings[0]?.artifacts).toHaveLength(3);
	});
});

// ── describeArtifact ──────────────────────────────────────────────────────────

describe('ConnascenceOfMeaningRule.describeArtifact()', () => {
	const rule = new ConnascenceOfMeaningRule();

	test('source artifact with column → location includes column', () => {
		const c = makeConstant({
			location: { file: '/src/auth.ts', line: 42, column: 7 },
			raw: '"ADMIN"',
			context: 'assignment',
		});
		const described = rule.describeArtifact({ kind: 'source', data: c });
		expect(described.location).toBe('/src/auth.ts:42:7');
		expect(described.context).toBe('assignment');
		expect(described.value).toBe('"ADMIN"');
	});

	test('source artifact without column → location omits column', () => {
		const c = makeConstant({
			location: { file: '/src/auth.ts', line: 42 },
			raw: '"ADMIN"',
			context: 'condition',
		});
		const described = rule.describeArtifact({ kind: 'source', data: c });
		expect(described.location).toBe('/src/auth.ts:42');
		expect(described.context).toBe('condition');
	});

	test('unknown kind → returns stringified data', () => {
		const described = rule.describeArtifact({ kind: 'other', data: 'raw' });
		expect(described).toEqual({ value: 'raw' });
	});
});
