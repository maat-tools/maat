import { describe, expect, test } from 'bun:test';
import type { Collector, Enricher, Rule } from '@maat-tools/contracts';
import { makeCollector, makeEnricher, makeRule } from '@maat-tools/testing';
import { Kernel } from './index';

describe('Kernel fluent interface', () => {
	test('registerCollector returns this', () => {
		const kernel = new Kernel();
		expect(kernel.registerCollector(makeCollector([]))).toBe(kernel);
	});

	test('registerRule returns this', () => {
		const kernel = new Kernel();
		expect(kernel.registerRule(makeRule())).toBe(kernel);
	});

	test('registerEnricher returns this', () => {
		const kernel = new Kernel();
		expect(kernel.registerEnricher(makeEnricher())).toBe(kernel);
	});
});

describe('Kernel.registerCollector validation', () => {
	test('throws if collector id is empty', () => {
		const collector = { id: '', provideFacts: ['testFacts'] as const, collect: async () => ({ testFacts: [] }) };
		expect(() => new Kernel().registerCollector(collector)).toThrow('non-empty id');
	});

	test('throws if collector id is whitespace', () => {
		const collector = { id: '   ', provideFacts: ['testFacts'] as const, collect: async () => ({ testFacts: [] }) };
		expect(() => new Kernel().registerCollector(collector)).toThrow('non-empty id');
	});

	test('throws if provideFacts is empty', () => {
		const collector = { id: 'c', provideFacts: [] as const, collect: async () => ({}) };
		expect(() => new Kernel().registerCollector(collector as unknown as Collector<'testFacts'>)).toThrow(
			'provideFacts',
		);
	});

	test('throws if collect is not a function', () => {
		const collector = { id: 'c', provideFacts: ['testFacts'] as const, collect: 'bad' };
		expect(() => new Kernel().registerCollector(collector as unknown as Collector<'testFacts'>)).toThrow('collect');
	});
});

describe('Kernel.registerRule validation', () => {
	test('throws if instanceId is empty', () => {
		const rule = {
			instanceId: '',
			id: 'r@v1',
			needFacts: ['testFacts'] as const,
			evaluate: () => [],
			describeArtifact: () => ({}),
		};
		expect(() => new Kernel().registerRule(rule as unknown as Rule<'testFacts'>)).toThrow('non-empty instanceId');
	});

	test('throws if instanceId is whitespace', () => {
		const rule = {
			instanceId: '   ',
			id: 'r@v1',
			needFacts: ['testFacts'] as const,
			evaluate: () => [],
			describeArtifact: () => ({}),
		};
		expect(() => new Kernel().registerRule(rule as unknown as Rule<'testFacts'>)).toThrow('non-empty instanceId');
	});

	test('throws if rule id is empty', () => {
		const rule = {
			instanceId: 'r@v1',
			id: '',
			needFacts: ['testFacts'] as const,
			evaluate: () => [],
			describeArtifact: () => ({}),
		};
		expect(() => new Kernel().registerRule(rule as unknown as Rule<'testFacts'>)).toThrow('non-empty id');
	});

	test('throws if rule id is whitespace', () => {
		const rule = {
			instanceId: 'r@v1',
			id: '   ',
			needFacts: ['testFacts'] as const,
			evaluate: () => [],
			describeArtifact: () => ({}),
		};
		expect(() => new Kernel().registerRule(rule as unknown as Rule<'testFacts'>)).toThrow('non-empty id');
	});

	test('throws if evaluate is not a function', () => {
		const rule = { instanceId: 'r@v1', id: 'r@v1', needFacts: ['testFacts'] as const, evaluate: 'bad' };
		expect(() => new Kernel().registerRule(rule as unknown as Rule<'testFacts'>)).toThrow('evaluate');
	});

	test('throws if needFacts is not an array', () => {
		const rule = { instanceId: 'r@v1', id: 'r@v1', needFacts: 'bad', evaluate: () => [], describeArtifact: () => ({}) };
		expect(() => new Kernel().registerRule(rule as unknown as Rule<'testFacts'>)).toThrow('needFacts array');
	});

	test('throws if needFacts is empty', () => {
		const rule = {
			instanceId: 'r@v1',
			id: 'r@v1',
			needFacts: [] as const,
			evaluate: () => [],
			describeArtifact: () => ({}),
		};
		expect(() => new Kernel().registerRule(rule as unknown as Rule<never>)).toThrow('needFacts');
	});
});

describe('Kernel.registerEnricher validation', () => {
	test('throws if enricher id is empty', () => {
		const enricher = {
			id: '',
			needFacts: ['testFacts'] as const,
			provideFacts: ['enrichedFacts'] as const,
			enrich: async () => ({ enrichedFacts: [] }),
		};
		expect(() => new Kernel().registerEnricher(enricher as unknown as Enricher<'testFacts', 'enrichedFacts'>)).toThrow(
			'non-empty id',
		);
	});

	test('throws if enricher id is whitespace', () => {
		const enricher = {
			id: '   ',
			needFacts: ['testFacts'] as const,
			provideFacts: ['enrichedFacts'] as const,
			enrich: async () => ({ enrichedFacts: [] }),
		};
		expect(() => new Kernel().registerEnricher(enricher as unknown as Enricher<'testFacts', 'enrichedFacts'>)).toThrow(
			'non-empty id',
		);
	});

	test('throws if provideFacts is empty', () => {
		const enricher = {
			id: 'e',
			needFacts: ['testFacts'] as const,
			provideFacts: [] as const,
			enrich: async () => ({}),
		};
		expect(() => new Kernel().registerEnricher(enricher as unknown as Enricher<'testFacts', never>)).toThrow(
			'provideFacts',
		);
	});

	test('throws if enrich is not a function', () => {
		const enricher = {
			id: 'e',
			needFacts: ['testFacts'] as const,
			provideFacts: ['enrichedFacts'] as const,
			enrich: 'bad',
		};
		expect(() => new Kernel().registerEnricher(enricher as unknown as Enricher<'testFacts', 'enrichedFacts'>)).toThrow(
			'enrich',
		);
	});

	test('throws if needFacts is not an array', () => {
		const enricher = {
			id: 'e',
			needFacts: 'bad',
			provideFacts: ['enrichedFacts'] as const,
			enrich: async () => ({ enrichedFacts: [] }),
		};
		expect(() => new Kernel().registerEnricher(enricher as unknown as Enricher<'testFacts', 'enrichedFacts'>)).toThrow(
			'needFacts array',
		);
	});

	test('accepts enricher with empty needFacts', () => {
		const enricher = {
			id: 'e@v1',
			needFacts: [] as const,
			provideFacts: ['enrichedFacts'] as const,
			enrich: async () => ({ enrichedFacts: [] }),
		};
		expect(() => new Kernel().registerEnricher(enricher as unknown as Enricher<never, 'enrichedFacts'>)).not.toThrow();
	});
});

describe('Kernel.getRuleById', () => {
	test('returns the rule when registered', () => {
		const rule = makeRule('my-rule@v1');
		const kernel = new Kernel().registerRule(rule);
		expect(kernel.getRuleById('my-rule@v1')).toBe(rule);
	});

	test('returns undefined for unknown id', () => {
		const kernel = new Kernel().registerRule(makeRule('known@v1'));
		expect(kernel.getRuleById('unknown@v1')).toBeUndefined();
	});

	test('returns undefined when no rules registered', () => {
		expect(new Kernel().getRuleById('any@v1')).toBeUndefined();
	});
});

describe('Kernel duplicate registration', () => {
	test('throws if collector id is duplicated', () => {
		const kernel = new Kernel().registerCollector(makeCollector(['a']));
		expect(() => kernel.registerCollector(makeCollector(['b']))).toThrow(
			'Collector with id "test-collector" is already registered',
		);
	});

	test('throws if enricher id is duplicated', () => {
		const kernel = new Kernel().registerEnricher(makeEnricher());
		expect(() => kernel.registerEnricher(makeEnricher())).toThrow(
			'Enricher with id "test-enricher" is already registered',
		);
	});

	test('throws if rule instanceId is duplicated', () => {
		const kernel = new Kernel().registerRule(makeRule('dup-rule@v1'));
		expect(() => kernel.registerRule(makeRule('dup-rule@v1'))).toThrow(
			'Rule with instanceId "dup-rule@v1" is already registered',
		);
	});

	test('allows two rules with same id but different instanceId', () => {
		const kernel = new Kernel();
		expect(() => {
			kernel.registerRule(makeRule('rule@v1', 'instance-a'));
			kernel.registerRule(makeRule('rule@v1', 'instance-b'));
		}).not.toThrow();
	});
});
