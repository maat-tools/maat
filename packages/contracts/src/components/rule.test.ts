import { describe, expect, test } from 'bun:test';
import {
	defineRule,
	defineRuleBuilder,
	defineRuleSet,
	isRule,
	isRuleBuilder,
	isRuleFactory,
	isRuleSet,
	RULE_FACTORY_BRAND,
	RULE_SET_BRAND,
} from './rule';

describe('defineRule', () => {
	test('returns function with brand symbol', () => {
		const factory = defineRule(() => ({
			instanceId: 'r',
			id: 'r',
			needFacts: [],
			evaluate: () => [],
			describeArtifact: () => ({}),
		}));
		expect(typeof factory).toBe('function');
		expect(factory[RULE_FACTORY_BRAND]).toBe(true);
	});
});

describe('defineRuleSet', () => {
	test('returns object with brand symbol and factories array', () => {
		const f = defineRule(() => ({
			instanceId: 'r',
			id: 'r',
			needFacts: [],
			evaluate: () => [],
			describeArtifact: () => ({}),
		}));
		const set = defineRuleSet([f]);
		expect(set[RULE_SET_BRAND]).toBe(true);
		expect(set.factories).toHaveLength(1);
		expect(set.factories[0] as unknown).toBe(f);
	});
});

describe('defineRuleBuilder', () => {
	test('returns the same object (identity)', () => {
		const original = {
			build: () => ({
				instanceId: 'r',
				id: 'r',
				needFacts: ['x' as never],
				evaluate: () => [],
				describeArtifact: () => ({}),
			}),
		};
		const result = defineRuleBuilder(original);
		expect(result).toBe(original);
	});

	test('preserves all original methods on the builder', () => {
		const original = {
			build: () => ({
				instanceId: 'r',
				id: 'r',
				needFacts: ['x' as never],
				evaluate: () => [],
				describeArtifact: () => ({}),
			}),
			extra: () => 42,
		};
		const branded = defineRuleBuilder(original);
		expect(branded.extra()).toBe(42);
	});
});

describe('isRuleFactory', () => {
	test('true for branded function', () => {
		const factory = defineRule(() => ({
			instanceId: 'r',
			id: 'r',
			needFacts: [],
			evaluate: () => [],
			describeArtifact: () => ({}),
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
			instanceId: 'r',
			id: 'r',
			needFacts: [],
			evaluate: () => [],
			describeArtifact: () => ({}),
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

describe('isRuleBuilder', () => {
	test('true for any object with build()', () => {
		const builder = defineRuleBuilder({
			build: () => ({
				instanceId: 'r',
				id: 'r',
				needFacts: ['x' as never],
				evaluate: () => [],
				describeArtifact: () => ({}),
			}),
		});
		expect(isRuleBuilder(builder)).toBe(true);
	});

	test('true for plain object with build() — structural check', () => {
		expect(
			isRuleBuilder({
				build: () => ({ id: 'r', needFacts: [], evaluate: () => [] }),
			}),
		).toBe(true);
	});

	test('false for null', () => {
		expect(isRuleBuilder(null)).toBe(false);
	});

	test('false for plain function', () => {
		expect(isRuleBuilder(() => {})).toBe(false);
	});
});
