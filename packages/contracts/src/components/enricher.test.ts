import { describe, expect, test } from 'bun:test';
import { defineEnricher, ENRICHER_FACTORY_BRAND, isEnricher, isEnricherFactory } from './enricher';

describe('defineEnricher', () => {
	test('returns function with brand symbol', () => {
		const factory = defineEnricher(() => ({
			id: 'e',
			needFacts: [],
			provideFacts: [],
			enrich: async () => ({ facts: {} }),
		}));
		expect(typeof factory).toBe('function');
		expect(factory[ENRICHER_FACTORY_BRAND]).toBe(true);
	});
});

describe('isEnricherFactory', () => {
	test('true for branded function', () => {
		const factory = defineEnricher(() => ({
			id: 'e',
			needFacts: [],
			provideFacts: [],
			enrich: async () => ({ facts: {} }),
		}));
		expect(isEnricherFactory(factory)).toBe(true);
	});

	test('false for plain function', () => {
		expect(isEnricherFactory(() => {})).toBe(false);
	});

	test('false for non-function', () => {
		expect(isEnricherFactory({ [ENRICHER_FACTORY_BRAND]: true })).toBe(false);
		expect(isEnricherFactory(null)).toBe(false);
	});
});

describe('isEnricher', () => {
	test('true for object with correct shape', () => {
		const enricher = {
			id: 'e',
			needFacts: [],
			provideFacts: [],
			enrich: async () => ({}),
		};
		expect(isEnricher(enricher)).toBe(true);
	});

	test('false if id is missing', () => {
		expect(isEnricher({ needFacts: [], provideFacts: [], enrich: async () => ({}) })).toBe(false);
	});

	test('false if needFacts is not array', () => {
		expect(isEnricher({ id: 'e', needFacts: 'bad', provideFacts: [], enrich: async () => ({}) })).toBe(false);
	});

	test('false if provideFacts is not array', () => {
		expect(isEnricher({ id: 'e', needFacts: [], provideFacts: 'bad', enrich: async () => ({}) })).toBe(false);
	});

	test('false if enrich is not a function', () => {
		expect(isEnricher({ id: 'e', needFacts: [], provideFacts: [] })).toBe(false);
	});

	test('false for null', () => {
		expect(isEnricher(null)).toBe(false);
	});
});
