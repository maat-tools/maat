import { describe, expect, test } from 'bun:test';
import type { Collector, Enricher, Rule } from '@maat-tools/contracts';
import { makeCollector, makeRule } from '@maat-tools/testing';
import { Kernel } from './index';

function makeRuleConsumingEnriched(id = 'rule-enriched@v1'): Rule<'enrichedFacts'> {
	return {
		instanceId: id,
		id,
		needFacts: ['enrichedFacts'] as const,
		evaluate: ({ enrichedFacts }) => ({
			findings: enrichedFacts.map((value, i) => ({
				ruleId: id,
				ruleIdentifier: { value, i },
				message: `finding: ${value}`,
				artifacts: [],
			})),
		}),
		describeArtifact: (artifact) => ({ value: String(artifact.data) }),
	};
}

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

	test('enricher sets finding.requiresVerification', async () => {
		const kernel = new Kernel()
			.registerCollector(makeCollector(['x']))
			.registerEnricher(makeEnricher())
			.registerRule(makeRuleConsumingEnriched());
		const { findings } = await kernel.run();
		expect(findings[0]?.requiresVerification).toBe(true);
	});

	test('rule consuming both collector and enriched facts gets requiresVerification', async () => {
		const mixedRule: Rule<'testFacts' | 'enrichedFacts'> = {
			instanceId: 'mixed@v1',
			id: 'mixed@v1',
			needFacts: ['testFacts', 'enrichedFacts'] as const,
			evaluate: ({ testFacts, enrichedFacts }) => ({
				findings: [
					{
						ruleId: 'mixed@v1',
						ruleIdentifier: { count: testFacts.length + enrichedFacts.length },
						message: 'mixed finding',
						artifacts: [],
					},
				],
			}),
			describeArtifact: (artifact) => ({ value: String(artifact.data) }),
		};

		const { findings } = await new Kernel()
			.registerCollector(makeCollector(['a']))
			.registerEnricher(makeEnricher())
			.registerRule(mixedRule)
			.run();

		expect(findings[0]?.requiresVerification).toBe(true);
	});

	test('enricher is skipped when required facts are missing', async () => {
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

	test('enricher with empty needFacts produces facts and marks them for verification', async () => {
		const standaloneEnricher: Enricher<never, 'enrichedFacts'> = {
			id: 'standalone-enricher',
			needFacts: [] as const,
			provideFacts: ['enrichedFacts'] as const,
			enrich: async () => ({ facts: { enrichedFacts: ['standalone'] } }),
		};

		const { findings } = await new Kernel()
			.registerCollector(makeCollector(['x']))
			.registerEnricher(standaloneEnricher)
			.registerRule(makeRuleConsumingEnriched())
			.run();

		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toBe('finding: standalone');
		expect(findings[0]?.requiresVerification).toBe(true);
	});

	test('enricher array facts merge with collector array facts for the same key', async () => {
		const collector: Collector<'testFacts' | 'enrichedFacts'> = {
			id: 'collector-with-enriched',
			provideFacts: ['testFacts', 'enrichedFacts'] as const,
			collect: async () => ({ testFacts: ['x'], enrichedFacts: ['from-collector'] }),
		};

		const { findings } = await new Kernel()
			.registerCollector(collector)
			.registerEnricher(makeEnricher())
			.registerRule(makeRuleConsumingEnriched())
			.run();

		expect(findings).toHaveLength(2);
		expect(findings.map((f) => f.message).sort()).toEqual(['finding: enriched:x', 'finding: from-collector']);
	});

	test('enricher rejection causes run to reject', async () => {
		const failingEnricher: Enricher<'testFacts', 'enrichedFacts'> = {
			id: 'failing-enricher',
			needFacts: ['testFacts'] as const,
			provideFacts: ['enrichedFacts'] as const,
			enrich: async () => {
				throw new Error('enrich failed');
			},
		};
		const kernel = new Kernel()
			.registerCollector(makeCollector(['x']))
			.registerEnricher(failingEnricher)
			.registerRule(makeRule());
		await expect(kernel.run()).rejects.toThrow('enrich failed');
	});

	test('enricher receives useCache: true by default', async () => {
		const seenOptions: { useCache?: boolean }[] = [];
		const observingEnricher: Enricher<'testFacts', 'enrichedFacts'> = {
			id: 'observing-enricher',
			needFacts: ['testFacts'] as const,
			provideFacts: ['enrichedFacts'] as const,
			enrich: async (_facts, options) => {
				seenOptions.push(options ?? {});
				return { facts: { enrichedFacts: ['seen'] } };
			},
		};

		await new Kernel()
			.registerCollector(makeCollector(['x']))
			.registerEnricher(observingEnricher)
			.registerRule(makeRuleConsumingEnriched())
			.run();

		expect(seenOptions).toEqual([{ useCache: true }]);
	});

	test('enricher receives useCache: false when Kernel.run is called with useCache: false', async () => {
		const seenOptions: { useCache?: boolean }[] = [];
		const observingEnricher: Enricher<'testFacts', 'enrichedFacts'> = {
			id: 'observing-enricher',
			needFacts: ['testFacts'] as const,
			provideFacts: ['enrichedFacts'] as const,
			enrich: async (_facts, options) => {
				seenOptions.push(options ?? {});
				return { facts: { enrichedFacts: ['seen'] } };
			},
		};

		await new Kernel()
			.registerCollector(makeCollector(['x']))
			.registerEnricher(observingEnricher)
			.registerRule(makeRuleConsumingEnriched())
			.run({ useCache: false });

		expect(seenOptions).toEqual([{ useCache: false }]);
	});

	test('standalone enricher receives useCache option from Kernel.run', async () => {
		const seenOptions: { useCache?: boolean }[] = [];
		const standaloneEnricher: Enricher<never, 'enrichedFacts'> = {
			id: 'standalone-enricher',
			needFacts: [] as const,
			provideFacts: ['enrichedFacts'] as const,
			enrich: async (_facts, options) => {
				seenOptions.push(options ?? {});
				return { facts: { enrichedFacts: ['standalone'] } };
			},
		};

		await new Kernel()
			.registerCollector(makeCollector(['x']))
			.registerEnricher(standaloneEnricher)
			.registerRule(makeRuleConsumingEnriched())
			.run({ useCache: false });

		expect(seenOptions).toEqual([{ useCache: false }]);
	});
});

function makeEnricher(): Enricher<'testFacts', 'enrichedFacts'> {
	return {
		id: 'test-enricher',
		needFacts: ['testFacts'] as const,
		provideFacts: ['enrichedFacts'] as const,
		enrich: async ({ testFacts }: { testFacts: string[] } = { testFacts: [] }) => ({
			facts: { enrichedFacts: testFacts.map((v) => `enriched:${v}`) },
		}),
	};
}
