import { describe, expect, test } from 'bun:test';
import { formatElapsedTime } from './format';

describe('formatElapsedTime', () => {
	test('sub-millisecond rounds to 0ms', () => {
		expect(formatElapsedTime(0.4)).toBe('0ms');
	});

	test('shows milliseconds for values under 1 second', () => {
		expect(formatElapsedTime(0)).toBe('0ms');
		expect(formatElapsedTime(1)).toBe('1ms');
		expect(formatElapsedTime(999)).toBe('999ms');
	});

	test('shows seconds with one decimal for values under 1 minute', () => {
		expect(formatElapsedTime(1000)).toBe('1.0s');
		expect(formatElapsedTime(1500)).toBe('1.5s');
		expect(formatElapsedTime(59999)).toBe('60.0s');
	});

	test('shows minutes and seconds for values of 1 minute or more', () => {
		expect(formatElapsedTime(60000)).toBe('1m 0s');
		expect(formatElapsedTime(61000)).toBe('1m 1s');
		expect(formatElapsedTime(105000)).toBe('1m 45s');
		expect(formatElapsedTime(120000)).toBe('2m 0s');
		expect(formatElapsedTime(125000)).toBe('2m 5s');
	});

	test('sub-second rounding in the minute+ range', () => {
		expect(formatElapsedTime(105400)).toBe('1m 45s');
		expect(formatElapsedTime(105500)).toBe('1m 46s');
	});
});
