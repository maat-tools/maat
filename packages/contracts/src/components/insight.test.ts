import { describe, expect, test } from 'bun:test';
import { isInsight } from './insight';

describe('isInsight', () => {
	test('true for object with correct shape', () => {
		expect(isInsight({ id: 'i', needRules: [], analyze: () => [] })).toBe(true);
	});

	test('false if needRules is not array', () => {
		expect(isInsight({ id: 'i', needRules: 'bad', analyze: () => [] })).toBe(false);
	});

	test('false for null', () => {
		expect(isInsight(null)).toBe(false);
	});
});
