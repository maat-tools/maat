import { describe, expect, test } from 'bun:test';
import type { Collector, FactRegistry, Insight, LedgerBackend, LedgerEvent, Rule } from './index';
import {
	COLLECTOR_FACTORY_BRAND,
	defineCollector,
	defineInsight,
	defineInsightSet,
	defineLedgerBackend,
	defineRule,
	defineRuleSet,
	isCollector,
	isCollectorFactory,
	isInsight,
	isInsightFactory,
	isInsightSet,
	isLedgerBackendFactory,
	isRule,
	isRuleFactory,
	isRuleSet,
	INSIGHT_FACTORY_BRAND,
	INSIGHT_SET_BRAND,
	LEDGER_BACKEND_FACTORY_BRAND,
	RULE_FACTORY_BRAND,
	RULE_SET_BRAND,
} from './index';

// Extend FactRegistry for test purposes
declare module './index' {
	interface FactRegistry {
		testFact: string;
	}
}

// ─── Minimal stubs ────────────────────────────────────────────────────────────

const stubCollectorFactory = defineCollector((_config: { root: string }) => ({
	id: 'stub-collector',
	provideFacts: ['testFact'] as const,
	collect: async () => ({ testFact: 'hello' }),
}));

const stubRuleFactory = defineRule(() => ({
	id: 'stub-rule',
	needFacts: ['testFact'] as const,
	evaluate: () => [],
}));

// ─── defineCollector ──────────────────────────────────────────────────────────

describe('defineCollector()', () => {
	test('returns a function', () => {
		expect(typeof stubCollectorFactory).toBe('function');
	});

	test('stamps the brand symbol onto the factory', () => {
		expect(
			(stubCollectorFactory as unknown as Record<symbol, unknown>)[
				COLLECTOR_FACTORY_BRAND
			],
		).toBe(true);
	});

	test('the returned factory produces a valid collector', async () => {
		const collector = stubCollectorFactory({ root: '/src' });
		expect(collector.id).toBe('stub-collector');
		expect(collector.provideFacts).toContain('testFact');
		expect(await collector.collect()).toEqual({ testFact: 'hello' });
	});
});

// ─── defineRule ───────────────────────────────────────────────────────────────

describe('defineRule()', () => {
	test('returns a function', () => {
		expect(typeof stubRuleFactory).toBe('function');
	});

	test('stamps the brand symbol onto the factory', () => {
		expect(
			(stubRuleFactory as unknown as Record<symbol, unknown>)[
				RULE_FACTORY_BRAND
			],
		).toBe(true);
	});

	test('the returned factory produces a valid rule', () => {
		const rule = stubRuleFactory();
		expect(rule.id).toBe('stub-rule');
		expect(rule.needFacts).toContain('testFact');
		expect(rule.evaluate({} as FactRegistry)).toEqual([]);
	});
});

// ─── defineRuleSet ────────────────────────────────────────────────────────────

describe('defineRuleSet()', () => {
	test('stamps the brand symbol onto the rule set', () => {
		const ruleSet = defineRuleSet([stubRuleFactory]);
		expect(
			(ruleSet as unknown as Record<symbol, unknown>)[RULE_SET_BRAND],
		).toBe(true);
	});

	test('exposes the factories array', () => {
		const ruleSet = defineRuleSet([stubRuleFactory]);
		expect(ruleSet.factories).toContain(stubRuleFactory);
	});

	test('accepts an empty factories array', () => {
		const ruleSet = defineRuleSet([]);
		expect(ruleSet.factories).toHaveLength(0);
	});
});

// ─── isCollectorFactory ───────────────────────────────────────────────────────

describe('isCollectorFactory()', () => {
	test('returns true for a branded collector factory', () => {
		expect(isCollectorFactory(stubCollectorFactory)).toBe(true);
	});

	test('returns false for a plain function', () => {
		expect(isCollectorFactory(() => {})).toBe(false);
	});

	test('returns false for null', () => {
		expect(isCollectorFactory(null)).toBe(false);
	});

	test('returns false for a non-function value', () => {
		expect(isCollectorFactory({ [COLLECTOR_FACTORY_BRAND]: true })).toBe(false);
	});
});

// ─── isRuleFactory ────────────────────────────────────────────────────────────

describe('isRuleFactory()', () => {
	test('returns true for a branded rule factory', () => {
		expect(isRuleFactory(stubRuleFactory)).toBe(true);
	});

	test('returns false for a plain function', () => {
		expect(isRuleFactory(() => {})).toBe(false);
	});

	test('returns false for null', () => {
		expect(isRuleFactory(null)).toBe(false);
	});

	test('returns false for a non-function value', () => {
		expect(isRuleFactory({ [RULE_FACTORY_BRAND]: true })).toBe(false);
	});
});

// ─── isRuleSet ────────────────────────────────────────────────────────────────

describe('isRuleSet()', () => {
	test('returns true for a branded rule set', () => {
		const ruleSet = defineRuleSet([stubRuleFactory]);
		expect(isRuleSet(ruleSet)).toBe(true);
	});

	test('returns false for a plain object', () => {
		expect(isRuleSet({ factories: [] })).toBe(false);
	});

	test('returns false for null', () => {
		expect(isRuleSet(null)).toBe(false);
	});

	test('returns false for a non-object', () => {
		expect(isRuleSet('rule-set')).toBe(false);
	});
});

// ─── isCollector ──────────────────────────────────────────────────────────────

describe('isCollector()', () => {
	const validCollector: Collector<'testFact'> = {
		id: 'c1',
		provideFacts: ['testFact'],
		collect: async () => ({ testFact: 'x' }),
	};

	test('returns true for a valid collector object', () => {
		expect(isCollector(validCollector)).toBe(true);
	});

	test('returns false when id is missing', () => {
		expect(isCollector({ provideFacts: [], collect: async () => ({}) })).toBe(
			false,
		);
	});

	test('returns false when provideFacts is not an array', () => {
		expect(
			isCollector({
				id: 'c1',
				provideFacts: 'testFact',
				collect: async () => ({}),
			}),
		).toBe(false);
	});

	test('returns false when collect is not a function', () => {
		expect(isCollector({ id: 'c1', provideFacts: [], collect: 'nope' })).toBe(
			false,
		);
	});

	test('returns false for null', () => {
		expect(isCollector(null)).toBe(false);
	});
});

// ─── isRule ───────────────────────────────────────────────────────────────────

describe('isRule()', () => {
	const validRule: Rule = {
		id: 'r1',
		needFacts: [],
		evaluate: () => [],
	};

	test('returns true for a valid rule object', () => {
		expect(isRule(validRule)).toBe(true);
	});

	test('returns false when id is missing', () => {
		expect(isRule({ needFacts: [], evaluate: () => [] })).toBe(false);
	});

	test('returns false when needFacts is not an array', () => {
		expect(isRule({ id: 'r1', needFacts: 'testFact', evaluate: () => [] })).toBe(
			false,
		);
	});

	test('returns false when evaluate is not a function', () => {
		expect(isRule({ id: 'r1', needFacts: [], evaluate: 'nope' })).toBe(false);
	});

	test('returns false for null', () => {
		expect(isRule(null)).toBe(false);
	});
});

// ─── defineLedgerBackend ──────────────────────────────────────────────────────

const stubLedgerBackendFactory = defineLedgerBackend((_config: { path: string }) => ({
	append: async (_event: LedgerEvent) => {},
}));

describe('defineLedgerBackend()', () => {
	test('returns a function', () => {
		expect(typeof stubLedgerBackendFactory).toBe('function');
	});

	test('stamps the brand symbol onto the factory', () => {
		expect(
			(stubLedgerBackendFactory as unknown as Record<symbol, unknown>)[
				LEDGER_BACKEND_FACTORY_BRAND
			],
		).toBe(true);
	});

	test('the returned factory produces an object with append()', () => {
		const backend = stubLedgerBackendFactory({ path: '/tmp/ledger.ndjson' });
		expect(typeof backend.append).toBe('function');
	});
});

// ─── isLedgerBackendFactory ───────────────────────────────────────────────────

describe('isLedgerBackendFactory()', () => {
	test('returns true for a branded ledger backend factory', () => {
		expect(isLedgerBackendFactory(stubLedgerBackendFactory)).toBe(true);
	});

	test('returns false for a plain function', () => {
		expect(isLedgerBackendFactory(() => {})).toBe(false);
	});

	test('returns false for null', () => {
		expect(isLedgerBackendFactory(null)).toBe(false);
	});

	test('returns false for a non-function value', () => {
		expect(isLedgerBackendFactory({ [LEDGER_BACKEND_FACTORY_BRAND]: true })).toBe(false);
	});

	test('returns false for a factory branded with a different symbol', () => {
		expect(isLedgerBackendFactory(stubCollectorFactory)).toBe(false);
	});
});

// ─── defineInsight ────────────────────────────────────────────────────────────

const stubInsightFactory = defineInsight(() => ({
	id: 'stub-insight',
	needRules: [],
	analyze: () => [],
}));

describe('defineInsight()', () => {
	test('returns a function', () => {
		expect(typeof stubInsightFactory).toBe('function');
	});

	test('stamps the brand symbol onto the factory', () => {
		expect(
			(stubInsightFactory as unknown as Record<symbol, unknown>)[
				INSIGHT_FACTORY_BRAND
			],
		).toBe(true);
	});

	test('the returned factory produces a valid insight', () => {
		const insight = stubInsightFactory();
		expect(insight.id).toBe('stub-insight');
		expect(insight.needRules).toEqual([]);
		expect(insight.analyze([])).toEqual([]);
	});
});

// ─── defineInsightSet ─────────────────────────────────────────────────────────

describe('defineInsightSet()', () => {
	test('stamps the brand symbol onto the insight set', () => {
		const insightSet = defineInsightSet([stubInsightFactory]);
		expect(
			(insightSet as unknown as Record<symbol, unknown>)[INSIGHT_SET_BRAND],
		).toBe(true);
	});

	test('exposes the factories array', () => {
		const insightSet = defineInsightSet([stubInsightFactory]);
		expect(insightSet.factories).toContain(stubInsightFactory);
	});

	test('accepts an empty factories array', () => {
		const insightSet = defineInsightSet([]);
		expect(insightSet.factories).toHaveLength(0);
	});
});

// ─── isInsightFactory ─────────────────────────────────────────────────────────

describe('isInsightFactory()', () => {
	test('returns true for a branded insight factory', () => {
		expect(isInsightFactory(stubInsightFactory)).toBe(true);
	});

	test('returns false for a plain function', () => {
		expect(isInsightFactory(() => {})).toBe(false);
	});

	test('returns false for null', () => {
		expect(isInsightFactory(null)).toBe(false);
	});

	test('returns false for a non-function value', () => {
		expect(isInsightFactory({ [INSIGHT_FACTORY_BRAND]: true })).toBe(false);
	});

	test('returns false for a factory branded with a different symbol', () => {
		expect(isInsightFactory(stubRuleFactory)).toBe(false);
	});
});

// ─── isInsightSet ─────────────────────────────────────────────────────────────

describe('isInsightSet()', () => {
	test('returns true for a branded insight set', () => {
		const insightSet = defineInsightSet([stubInsightFactory]);
		expect(isInsightSet(insightSet)).toBe(true);
	});

	test('returns false for a plain object', () => {
		expect(isInsightSet({ factories: [] })).toBe(false);
	});

	test('returns false for null', () => {
		expect(isInsightSet(null)).toBe(false);
	});

	test('returns false for a non-object', () => {
		expect(isInsightSet('insight-set')).toBe(false);
	});
});

// ─── isInsight ────────────────────────────────────────────────────────────────

describe('isInsight()', () => {
	const validInsight: Insight = {
		id: 'i1',
		needRules: [],
		analyze: () => [],
	};

	test('returns true for a valid insight object', () => {
		expect(isInsight(validInsight)).toBe(true);
	});

	test('returns false when id is missing', () => {
		expect(isInsight({ needRules: [], analyze: () => [] })).toBe(false);
	});

	test('returns false when needRules is not an array', () => {
		expect(isInsight({ id: 'i1', needRules: 'rule-a', analyze: () => [] })).toBe(false);
	});

	test('returns false when analyze is not a function', () => {
		expect(isInsight({ id: 'i1', needRules: [], analyze: 'nope' })).toBe(false);
	});

	test('returns false for null', () => {
		expect(isInsight(null)).toBe(false);
	});
});

// ─── LedgerBackend (runtime shape) ───────────────────────────────────────────

describe('LedgerBackend (produced by defineLedgerBackend)', () => {
	test('append() resolves without throwing for a valid event', async () => {
		const backend: LedgerBackend = stubLedgerBackendFactory({ path: '/tmp/x' });
		const event: LedgerEvent = {
			type: 'finding.observed',
			entry_id: '01JTEST00000000000000000000',
			timestamp: '2026-05-04T00:00:00.000Z',
			fingerprint: 'f-1',
			rule_id: 'r-1',
			message: 'test finding',
			artifacts: [],
		};
		await expect(backend.append(event)).resolves.toBeUndefined();
	});
});
