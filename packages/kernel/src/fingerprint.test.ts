import { describe, expect, test } from 'bun:test';
import { generateFingerprint } from './fingerprint';

describe('generateFingerprint', () => {
	test('same input produces the same hash', () => {
		const a = generateFingerprint('rule@v1', { value: 'x', index: 1 });
		const b = generateFingerprint('rule@v1', { value: 'x', index: 1 });
		expect(a).toBe(b);
	});

	test('different ruleId produces a different hash', () => {
		const a = generateFingerprint('rule-a@v1', { value: 'x' });
		const b = generateFingerprint('rule-b@v1', { value: 'x' });
		expect(a).not.toBe(b);
	});

	test('different identifier produces a different hash', () => {
		const a = generateFingerprint('rule@v1', { value: 'x' });
		const b = generateFingerprint('rule@v1', { value: 'y' });
		expect(a).not.toBe(b);
	});

	test('key ordering in objects does not affect the hash', () => {
		const a = generateFingerprint('rule@v1', { a: 1, b: 2 });
		const b = generateFingerprint('rule@v1', { b: 2, a: 1 });
		expect(a).toBe(b);
	});

	test('nested objects are stabilized', () => {
		const a = generateFingerprint('rule@v1', { outer: { b: 2, a: 1 } });
		const b = generateFingerprint('rule@v1', { outer: { a: 1, b: 2 } });
		expect(a).toBe(b);
	});

	test('arrays preserve order', () => {
		const a = generateFingerprint('rule@v1', { items: ['a', 'b'] });
		const b = generateFingerprint('rule@v1', { items: ['b', 'a'] });
		expect(a).not.toBe(b);
	});

	test('supports primitive values', () => {
		const string = generateFingerprint('rule@v1', { value: 'text' });
		const number = generateFingerprint('rule@v1', { value: 42 });
		const boolean = generateFingerprint('rule@v1', { value: true });
		const nullish = generateFingerprint('rule@v1', { value: null });

		expect(new Set([string, number, boolean, nullish]).size).toBe(4);
	});
});
