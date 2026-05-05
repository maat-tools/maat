import { describe, expect, test } from 'bun:test';
import {
	RuleBase,
	fingerprintFinding,
	stableHash,
	stableStringify,
} from './index';

class TestRuleBase extends RuleBase {}

describe('stableStringify()', () => {
	test('sorts object keys recursively while preserving array order', () => {
		const data = {
			z: 1,
			a: {
				y: true,
				x: [2, { b: 'b', a: 'a' }],
			},
		};

		expect(stableStringify(data)).toBe(
			'{"a":{"x":[2,{"a":"a","b":"b"}],"y":true},"z":1}',
		);
	});
});

describe('stableHash()', () => {
	test('returns the same hash for equivalent data with different key order', () => {
		const first = { ruleId: 'rule-a', data: { b: 2, a: 1 } };
		const second = { data: { a: 1, b: 2 }, ruleId: 'rule-a' };

		expect(stableHash(first)).toBe(stableHash(second));
	});

	test('preserves array order as meaningful data', () => {
		expect(stableHash(['a', 'b'])).not.toBe(stableHash(['b', 'a']));
	});
});

describe('fingerprintFinding()', () => {
	test('returns the same fingerprint for the same finding data', () => {
		const first = {
			ruleId: 'rule-a',
			message: 'Something is wrong',
			artifacts: [
				{
					kind: 'source',
					data: { file: 'b.ts', location: { line: 2, column: 1 } },
				},
			],
		};
		const second = {
			message: 'Something is wrong',
			artifacts: [
				{
					data: { location: { column: 1, line: 2 }, file: 'b.ts' },
					kind: 'source',
				},
			],
			ruleId: 'rule-a',
		};

		expect(fingerprintFinding(first)).toBe(fingerprintFinding(second));
		expect(fingerprintFinding(first)).toMatch(/^[a-f0-9]{64}$/);
	});
});

describe('RuleBase.generateFingerprint()', () => {
	test('uses stable hashing for arbitrary rule data', () => {
		const rule = new TestRuleBase();

		expect(rule.generateFingerprint({ b: 2, a: 1 })).toBe(
			rule.generateFingerprint({ a: 1, b: 2 }),
		);
	});
});
