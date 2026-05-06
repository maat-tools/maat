import { describe, expect, test } from 'bun:test';
import {
	COLLECTOR_FACTORY_BRAND,
	defineCollector,
	defineRule,
	defineRuleBuilder,
	defineRuleSet,
	isCollector,
	isInsight,
	isRule,
	isRuleBuilder,
	isRuleFactory,
	isRuleSet,
	RULE_BUILDER_BRAND,
	RULE_FACTORY_BRAND,
	RULE_SET_BRAND,
} from './index';

describe('defineRule', () => {
	test('returns function with brand symbol', () => {
		const factory = defineRule(() => ({
			id: 'r',
			needFacts: [],
			evaluate: () => [],
		}));
		expect(typeof factory).toBe('function');
		expect(factory[RULE_FACTORY_BRAND]).toBe(true);
	});
});

describe('defineRuleSet', () => {
	test('returns object with brand symbol and factories array', () => {
		const f = defineRule(() => ({
			id: 'r',
			needFacts: [],
			evaluate: () => [],
		}));
		const set = defineRuleSet([f]);
		expect(set[RULE_SET_BRAND]).toBe(true);
		expect(set.factories).toHaveLength(1);
		expect(set.factories[0] as unknown).toBe(f);
	});
});

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

describe('isRuleFactory', () => {
	test('true for branded function', () => {
		const factory = defineRule(() => ({
			id: 'r',
			needFacts: [],
			evaluate: () => [],
		}));
		expect(isRuleFactory(factory)).toBe(true);
	});

	test('false for plain function', () => {
		expect(isRuleFactory(() => {})).toBe(false);
	});

	test('false for non-function', () => {
		expect(isRuleFactory({ [RULE_FACTORY_BRAND]: true })).toBe(false);
		expect(isRuleFactory(null)).toBe(false);
	});
});

describe('isRuleSet', () => {
	test('true for branded object', () => {
		const f = defineRule(() => ({
			id: 'r',
			needFacts: [],
			evaluate: () => [],
		}));
		expect(isRuleSet(defineRuleSet([f]))).toBe(true);
	});

	test('false for null', () => {
		expect(isRuleSet(null)).toBe(false);
	});

	test('false for plain object', () => {
		expect(isRuleSet({ factories: [] })).toBe(false);
	});
});

describe('isCollector', () => {
	test('true for object with correct shape', () => {
		const collector = { id: 'c', provideFacts: [], collect: async () => ({}) };
		expect(isCollector(collector)).toBe(true);
	});

	test('false if id is missing', () => {
		expect(isCollector({ provideFacts: [], collect: async () => ({}) })).toBe(
			false,
		);
	});

	test('false if provideFacts is not array', () => {
		expect(
			isCollector({ id: 'c', provideFacts: 'bad', collect: async () => ({}) }),
		).toBe(false);
	});

	test('false if collect is not a function', () => {
		expect(isCollector({ id: 'c', provideFacts: [] })).toBe(false);
	});
});

describe('isRule', () => {
	test('true for object with correct shape', () => {
		expect(isRule({ id: 'r', needFacts: [], evaluate: () => [] })).toBe(true);
	});

	test('false if evaluate is missing', () => {
		expect(isRule({ id: 'r', needFacts: [] })).toBe(false);
	});

	test('false for null', () => {
		expect(isRule(null)).toBe(false);
	});
});

describe('isInsight', () => {
	test('true for object with correct shape', () => {
		expect(isInsight({ id: 'i', needRules: [], analyze: () => [] })).toBe(true);
	});

	test('false if needRules is not array', () => {
		expect(isInsight({ id: 'i', needRules: 'bad', analyze: () => [] })).toBe(
			false,
		);
	});

	test('false for null', () => {
		expect(isInsight(null)).toBe(false);
	});
});

describe('defineRuleBuilder', () => {
	test('returns object with RULE_BUILDER_BRAND', () => {
		const builder = defineRuleBuilder({
			build: () => ({ id: 'r', needFacts: ['x' as never], evaluate: () => [] }),
		});
		expect(builder[RULE_BUILDER_BRAND]).toBe(true);
	});

	test('preserves all original methods on the builder', () => {
		const original = {
			build: () => ({ id: 'r', needFacts: ['x' as never], evaluate: () => [] }),
			extra: () => 42,
		};
		const branded = defineRuleBuilder(original);
		expect(branded.extra()).toBe(42);
	});
});

describe('isRuleBuilder', () => {
	test('true for branded builder', () => {
		const builder = defineRuleBuilder({
			build: () => ({ id: 'r', needFacts: ['x' as never], evaluate: () => [] }),
		});
		expect(isRuleBuilder(builder)).toBe(true);
	});

	test('false for unbranded object with build()', () => {
		expect(
			isRuleBuilder({
				build: () => ({ id: 'r', needFacts: [], evaluate: () => [] }),
			}),
		).toBe(false);
	});

	test('false for null', () => {
		expect(isRuleBuilder(null)).toBe(false);
	});

	test('false for plain function', () => {
		expect(isRuleBuilder(() => {})).toBe(false);
	});
});
