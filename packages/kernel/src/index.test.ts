import { describe, expect, test } from 'bun:test';
import type { Collector, Enricher, Rule } from '@maat-tools/contracts';
import { makeCollector, makeEnricher, makeRule } from '@maat-tools/testing';
import { Kernel } from './index';

function makeRuleConsumingEnriched(id = 'rule-enriched@v1'): Rule<'enrichedFacts'> {
	return {
		id,
		needFacts: ['enrichedFacts'] as const,
		evaluate: ({ enrichedFacts }) =>
			enrichedFacts.map((value, i) => ({
				ruleId: id,
				ruleIdentifier: { value, i },
				message: `finding: ${value}`,
				artifacts: [],
			})),
		describeArtifact: (artifact) => ({ value: String(artifact.data) }),
	};
}

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function timeout(ms: number): Promise<never> {
	return new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms));
}

describe('Kernel.run', () => {
	test('no collectors, no rules → empty findings', async () => {
		const { findings } = await new Kernel().run();
		expect(findings).toEqual([]);
	});

	test('collector provides facts, rule consumes them → findings produced', async () => {
		const kernel = new Kernel().registerCollector(makeCollector(['x'])).registerRule(makeRule());
		const { findings } = await kernel.run();
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('rule@v1');
	});

	test('rule needs fact not collected → skipped, no findings', async () => {
		const kernel = new Kernel().registerRule(makeRule());
		const { findings } = await kernel.run();
		expect(findings).toEqual([]);
	});

	test('two collectors with same array fact key → arrays merged', async () => {
		const kernel = new Kernel()
			.registerCollector(makeCollector(['a'], 'collector-a'))
			.registerCollector(makeCollector(['b'], 'collector-b'))
			.registerRule(makeRule());
		const { findings } = await kernel.run();
		expect(findings).toHaveLength(2);
	});

	test('rule receives only declared facts', async () => {
		const seenKeys: string[][] = [];
		const otherCollector: Collector<'otherFacts'> = {
			id: 'other-collector',
			provideFacts: ['otherFacts'] as const,
			collect: async () => ({ otherFacts: ['hidden'] }),
		};
		const inspectingRule: Rule<'testFacts'> = {
			id: 'inspecting-rule@v1',
			needFacts: ['testFacts'] as const,
			evaluate: (facts) => {
				seenKeys.push(Object.keys(facts).sort());
				return [];
			},
			describeArtifact: (artifact) => ({ value: String(artifact.data) }),
		};
		const kernel = new Kernel()
			.registerCollector(makeCollector(['visible']))
			.registerCollector(otherCollector)
			.registerRule(inspectingRule);
		await kernel.run();
		expect(seenKeys).toEqual([['testFacts']]);
	});

	test('collectors run concurrently and merge facts in registration order', async () => {
		const firstCollectorCanFinish = deferred<void>();
		const secondCollectorStarted = deferred<void>();
		const firstCollector: Collector<'testFacts'> = {
			id: 'first-collector',
			provideFacts: ['testFacts'] as const,
			collect: async () => {
				await secondCollectorStarted.promise;
				await firstCollectorCanFinish.promise;
				return { testFacts: ['first'] };
			},
		};
		const secondCollector: Collector<'testFacts'> = {
			id: 'second-collector',
			provideFacts: ['testFacts'] as const,
			collect: async () => {
				secondCollectorStarted.resolve();
				firstCollectorCanFinish.resolve();
				return { testFacts: ['second'] };
			},
		};
		const kernel = new Kernel()
			.registerCollector(firstCollector)
			.registerCollector(secondCollector)
			.registerRule(makeRule());
		const { findings } = await Promise.race([kernel.run(), timeout(100)]);
		expect(findings.map((f) => f.message)).toEqual(['finding: first', 'finding: second']);
	});

	test('same input across two runs produces identical fingerprints', async () => {
		const build = () =>
			new Kernel()
				.registerCollector(makeCollector(['stable']))
				.registerRule(makeRule())
				.run();
		const [r1, r2] = await Promise.all([build(), build()]);
		expect(r1.findings.map((f) => f.fingerprint)).toEqual(r2.findings.map((f) => f.fingerprint));
	});
});

describe('Kernel.run with enrichers', () => {
	test('enricher consumes collector facts and produces new facts for rules', async () => {
		const kernel = new Kernel()
			.registerCollector(makeCollector(['x']))
			.registerEnricher(makeEnricher())
			.registerRule(makeRuleConsumingEnriched());
		const { findings } = await kernel.run();
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toBe('finding: enriched:x');
	});

	test('enricher sets finding.requiresVerification and injects provenance artifact', async () => {
		const kernel = new Kernel()
			.registerCollector(makeCollector(['x']))
			.registerEnricher(makeEnricher())
			.registerRule(makeRuleConsumingEnriched());
		const { findings } = await kernel.run();
		expect(findings[0]?.requiresVerification).toBe(true);
		const provenance = findings[0]?.artifacts.filter((a) => a.kind === 'finding.provenance');
		expect(provenance).toHaveLength(1);
		expect(provenance?.[0]?.data).toEqual({ requiresVerification: true, sources: ['enrichedFacts'] });
	});

	test('rule consuming both collector and enriched facts gets requiresVerification and provenance', async () => {
		const mixedRule: Rule<'testFacts' | 'enrichedFacts'> = {
			id: 'mixed@v1',
			needFacts: ['testFacts', 'enrichedFacts'] as const,
			evaluate: ({ testFacts, enrichedFacts }) => [
				{
					ruleId: 'mixed@v1',
					ruleIdentifier: { count: testFacts.length + enrichedFacts.length },
					message: 'mixed finding',
					artifacts: [],
				},
			],
			describeArtifact: (artifact) => ({ value: String(artifact.data) }),
		};
		const kernel = new Kernel()
			.registerCollector(makeCollector(['a']))
			.registerEnricher(makeEnricher())
			.registerRule(mixedRule);
		const { findings } = await kernel.run();
		expect(findings[0]?.requiresVerification).toBe(true);
		expect(findings[0]?.artifacts.filter((a) => a.kind === 'finding.provenance')).toHaveLength(1);
	});

	test('enricher skipped when required facts are missing', async () => {
		const kernel = new Kernel().registerEnricher(makeEnricher()).registerRule(makeRuleConsumingEnriched());
		const { findings } = await kernel.run();
		expect(findings).toEqual([]);
	});

	test('enricher facts are merged into the global facts pool', async () => {
		const kernel = new Kernel()
			.registerCollector(makeCollector(['a']))
			.registerEnricher(makeEnricher())
			.registerRule(makeRule());
		const { findings } = await kernel.run();
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toBe('finding: a');
	});
});

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
	test('throws if rule id is empty', () => {
		expect(() => new Kernel().registerRule(makeRule(''))).toThrow('non-empty id');
	});

	test('throws if rule id is whitespace', () => {
		expect(() => new Kernel().registerRule(makeRule('   '))).toThrow('non-empty id');
	});

	test('accepts rule with empty needFacts (runs unconditionally)', () => {
		const rule = { id: 'r@v1', needFacts: [] as const, evaluate: () => [] };
		expect(() => new Kernel().registerRule(rule as unknown as Rule<'testFacts'>)).not.toThrow();
	});

	test('throws if evaluate is not a function', () => {
		const rule = { id: 'r@v1', needFacts: ['testFacts'] as const, evaluate: 'bad' };
		expect(() => new Kernel().registerRule(rule as unknown as Rule<'testFacts'>)).toThrow('evaluate');
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

	test('throws if rule id is duplicated', () => {
		const kernel = new Kernel().registerRule(makeRule('dup-rule@v1'));
		expect(() => kernel.registerRule(makeRule('dup-rule@v1'))).toThrow(
			'Rule with id "dup-rule@v1" is already registered',
		);
	});
});
