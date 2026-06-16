import { describe, expect, test } from 'bun:test';
import { COLLECTOR_FACTORY_BRAND, defineCollector, isCollector } from './collector';

describe('defineCollector', () => {
	test('returns function with brand symbol', () => {
		const factory = defineCollector(() => ({
			id: 'c',
			provideFacts: [],
			collect: async () => ({}),
		}));
		expect(typeof factory).toBe('function');
		expect(factory[COLLECTOR_FACTORY_BRAND]).toBe(true);
	});
});

describe('isCollector', () => {
	test('true for object with correct shape', () => {
		const collector = { id: 'c', provideFacts: [], collect: async () => ({}) };
		expect(isCollector(collector)).toBe(true);
	});

	test('false if id is missing', () => {
		expect(isCollector({ provideFacts: [], collect: async () => ({}) })).toBe(false);
	});

	test('false if provideFacts is not array', () => {
		expect(isCollector({ id: 'c', provideFacts: 'bad', collect: async () => ({}) })).toBe(false);
	});

	test('false if collect is not a function', () => {
		expect(isCollector({ id: 'c', provideFacts: [] })).toBe(false);
	});
});
