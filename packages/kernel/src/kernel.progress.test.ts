import { describe, expect, test } from 'bun:test';
import type { Enricher } from '@maat-tools/contracts';
import { makeCollector, makeEnricher, makeRule } from '@maat-tools/testing';
import { Kernel } from './index';

describe('Kernel.run progress events', () => {
	test('emits collector:start and collector:done for every collector', async () => {
		const events: unknown[] = [];
		const kernel = new Kernel()
			.registerCollector(makeCollector(['a'], 'collector-a'))
			.registerCollector(makeCollector(['b'], 'collector-b'))
			.registerRule(makeRule());

		await kernel.run({
			onProgress: (event) => events.push(event),
		});

		const starts = events.filter((e) => (e as { type: string }).type === 'collector:start');
		const dones = events.filter((e) => (e as { type: string }).type === 'collector:done');

		expect(starts).toHaveLength(2);
		expect(dones).toHaveLength(2);
		expect(starts.map((e) => (e as { collectorId: string }).collectorId).sort()).toEqual([
			'collector-a',
			'collector-b',
		]);
		expect(dones.map((e) => (e as { collectorId: string }).collectorId).sort()).toEqual(['collector-a', 'collector-b']);
		for (const event of events) {
			expect((event as { index: number }).index).toBeGreaterThanOrEqual(0);
			expect((event as { total: number }).total).toBe(2);
		}
	});

	test('emits enricher:start and enricher:done for every enricher', async () => {
		const events: unknown[] = [];
		const kernel = new Kernel()
			.registerCollector(makeCollector(['x']))
			.registerEnricher(makeEnricher())
			.registerRule(makeRule());

		await kernel.run({
			onProgress: (event) => events.push(event),
		});

		const starts = events.filter((e) => (e as { type: string }).type === 'enricher:start');
		const dones = events.filter((e) => (e as { type: string }).type === 'enricher:done');

		expect(starts).toHaveLength(1);
		expect(dones).toHaveLength(1);
		expect((starts[0] as { enricherId: string }).enricherId).toBe('test-enricher');
		expect((dones[0] as { enricherId: string }).enricherId).toBe('test-enricher');
		expect((dones[0] as { enriched: { usedTokens?: number; cost?: number } }).enriched).toEqual({
			usedTokens: undefined,
			cost: undefined,
		});
	});

	test('enricher:done reports usedTokens and cost', async () => {
		const events: unknown[] = [];
		const enricher: Enricher<'testFacts', 'enrichedFacts'> = {
			id: 'costly-enricher',
			needFacts: ['testFacts'] as const,
			provideFacts: ['enrichedFacts'] as const,
			enrich: async () => ({ facts: { enrichedFacts: [] }, usedTokens: 42, cost: 1.5 }),
		};

		await new Kernel()
			.registerCollector(makeCollector(['x']))
			.registerEnricher(enricher)
			.registerRule(makeRule())
			.run({
				onProgress: (event) => events.push(event),
			});

		const done = events.find((e) => (e as { type: string }).type === 'enricher:done');
		expect(done).toBeDefined();
		expect((done as { enriched: { usedTokens?: number; cost?: number } }).enriched).toEqual({
			usedTokens: 42,
			cost: 1.5,
		});
	});

	test('skipped enricher emits done with zero tokens and cost', async () => {
		const events: unknown[] = [];
		const skippedEnricher: Enricher<'otherFacts', 'enrichedFacts'> = {
			id: 'skipped-enricher',
			needFacts: ['otherFacts'] as const,
			provideFacts: ['enrichedFacts'] as const,
			enrich: async () => ({ facts: { enrichedFacts: [] } }),
		};
		const kernel = new Kernel()
			.registerCollector(makeCollector(['x']))
			.registerEnricher(skippedEnricher)
			.registerRule(makeRule());

		await kernel.run({
			onProgress: (event) => events.push(event),
		});

		const done = events.find((e) => (e as { type: string }).type === 'enricher:done');
		expect(done).toBeDefined();
		expect((done as { enriched: { usedTokens?: number; cost?: number } }).enriched).toEqual({ usedTokens: 0, cost: 0 });
	});

	test('empty-needFacts enricher emits done with returned tokens and cost', async () => {
		const events: unknown[] = [];
		const enricher: Enricher<never, 'enrichedFacts'> = {
			id: 'standalone-enricher',
			needFacts: [] as const,
			provideFacts: ['enrichedFacts'] as const,
			enrich: async () => ({ facts: { enrichedFacts: [] }, usedTokens: 7, cost: 0.25 }),
		};

		await new Kernel()
			.registerCollector(makeCollector(['x']))
			.registerEnricher(enricher)
			.registerRule(makeRule())
			.run({
				onProgress: (event) => events.push(event),
			});

		const done = events.find((e) => (e as { type: string }).type === 'enricher:done');
		expect(done).toBeDefined();
		expect((done as { enriched: { usedTokens?: number; cost?: number } }).enriched).toEqual({
			usedTokens: 7,
			cost: 0.25,
		});
	});
});
