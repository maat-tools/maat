import { afterEach, describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { LLMInteractor } from '.';
import { BaseLLMModel } from './base';
import { BatchLLMRequest } from './batch';
import type { JsonArraySchema, LLMConfig, LLMInput, LLMModel, LLMOutput, ModelCapabilities } from './types';

const SCORE_SCHEMA: JsonArraySchema = {
	type: 'array',
	items: {
		type: 'object',
		properties: { score: { type: 'number' } },
	},
};

type FakeItem = { id: number; payload: string };
type FakeResult = { score: number };

class FakeModel extends BaseLLMModel implements LLMModel {
	public calls: LLMInput[] = [];
	protected modelCapabilities: ModelCapabilities;

	public constructor(caps: ModelCapabilities) {
		super();
		this.modelCapabilities = caps;
	}

	public getCapabilities(): ModelCapabilities {
		return this.modelCapabilities;
	}

	public async call(input: LLMInput): Promise<LLMOutput> {
		this.calls.push(input);
		const keys = [...(input.context ?? '').matchAll(/--- Item \d+ \(key: ([^)]+)\) ---/g)].map((m) => m[1] as string);
		const results = keys.map((k, i) => ({ _key: k, score: i }));
		return { response: JSON.stringify(results), usedTokens: keys.length, cost: keys.length };
	}
}

class TestInteractor extends LLMInteractor {
	protected id: string;

	public constructor(model: LLMModel, id: string) {
		super({
			provider: 'vertex',
			model: 'gemini-3-5-flash',
			extra: { project: 't', location: 'us-central1' },
		} as LLMConfig);
		this.id = id;
		this.modelInstance = model;
		// The interactor builds its BatchLLMRequest in the super() constructor around the real
		// model; rebind it to the fake so batching/execution stay offline.
		(this as unknown as { batchRequest: BatchLLMRequest }).batchRequest = new BatchLLMRequest(model);
	}

	protected serializeItem(item: FakeItem): string {
		return `id:${item.id}|${item.payload}`;
	}

	public run(items: FakeItem[], options?: { useCache?: boolean }) {
		return this.batchedInteract<FakeItem, FakeResult>({
			items,
			instructions: 'Rate.',
			responseSchema: SCORE_SCHEMA,
			options,
		});
	}
}

const BIG_CAPS: ModelCapabilities = { maxInputTokens: 10_000, maxOutputTokens: 10_000 };

// The interactor's LocalCache writes under the working tree. Track ids and clean both the
// current (double-nested) and a future single-nested layout so cleanup survives a path fix.
const ids: string[] = [];
function nextId(): string {
	const id = `enr-${Math.floor(Math.random() * 1_000_000_000)}`;
	ids.push(id);
	return id;
}
afterEach(() => {
	const base = join(process.cwd(), '.maat', 'cache', 'enrichers');
	for (const id of ids.splice(0)) {
		rmSync(join(base, 'enrichers', id), { recursive: true, force: true });
		rmSync(join(base, id), { recursive: true, force: true });
	}
});

describe('LLMInteractor.batchedInteract', () => {
	test('returns an empty result (and zero usage) for empty input', async () => {
		const interactor = new TestInteractor(new FakeModel(BIG_CAPS), nextId());
		const { items, usedTokens, cost } = await interactor.run([]);
		expect(items).toEqual([]);
		expect(usedTokens).toBe(0);
		expect(cost).toBe(0);
	});

	test('returns a result for a single (index-0) cache-missed item', async () => {
		const interactor = new TestInteractor(new FakeModel(BIG_CAPS), nextId());
		const { items } = await interactor.run([{ id: 0, payload: 'x' }]);
		expect(items).toHaveLength(1);
		expect(items[0]?.result.score).toBe(0);
	});

	test('returns the original item reference, without injected internal fields', async () => {
		const item: FakeItem = { id: 0, payload: 'a' };
		const interactor = new TestInteractor(new FakeModel(BIG_CAPS), nextId());
		const { items } = await interactor.run([item]);
		expect(items[0]?.item).toBe(item);
		expect(items[0]?.item).not.toHaveProperty('serialized');
		expect(items[0]?.item).not.toHaveProperty('identifier');
	});

	test('preserves item order when work splits across multiple batches', async () => {
		// Tight output budget -> ~2 items per batch, so 6 items span multiple LLM calls.
		const model = new FakeModel({ maxInputTokens: 10_000, maxOutputTokens: 40 });
		const interactor = new TestInteractor(model, nextId());
		const input = Array.from({ length: 6 }, (_, i) => ({ id: i, payload: 'p' }));
		const { items } = await interactor.run(input);

		expect(model.calls.length).toBeGreaterThan(1);
		expect(items).toHaveLength(6);
		input.forEach((it, i) => {
			expect(items[i]?.item.id).toBe(it.id);
		});
	});

	test('keeps distinct items in place even when others share a serialization', async () => {
		const a: FakeItem = { id: 0, payload: 'dup' };
		const b: FakeItem = { id: 0, payload: 'dup' }; // genuinely identical content -> same hash as `a`
		const c: FakeItem = { id: 1, payload: 'middle' }; // distinct, sits between them
		const interactor = new TestInteractor(new FakeModel(BIG_CAPS), nextId());
		const { items } = await interactor.run([a, c, b]);

		// correct: [a, c, b] -> [0, 1, 0]   bug: c is displaced to the end -> [0, 0, 1]
		expect(items.map((r) => r.item.id)).toEqual([0, 1, 0]);
	});

	test('serves a second run entirely from cache and reports zero fresh usage', async () => {
		const id = nextId();
		const input = [
			{ id: 0, payload: 'a' },
			{ id: 1, payload: 'b' },
			{ id: 2, payload: 'c' },
		];

		const model1 = new FakeModel(BIG_CAPS);
		const fresh = await new TestInteractor(model1, id).run(input);
		expect(model1.calls.length).toBe(1);
		expect(fresh.items).toHaveLength(3);
		expect(fresh.usedTokens).toBe(3);
		expect(fresh.cost).toBe(3);

		const model2 = new FakeModel(BIG_CAPS);
		const cached = await new TestInteractor(model2, id).run(input);
		expect(model2.calls.length).toBe(0); // all hits -> no LLM call
		expect(cached.items).toHaveLength(3);
		expect(cached.usedTokens).toBe(0);
		expect(cached.cost).toBe(0);
	});

	test('useCache: false bypasses cache and calls the LLM again', async () => {
		const id = nextId();
		const input = [
			{ id: 0, payload: 'a' },
			{ id: 1, payload: 'b' },
		];

		const model1 = new FakeModel(BIG_CAPS);
		await new TestInteractor(model1, id).run(input);
		expect(model1.calls.length).toBe(1);

		const model2 = new FakeModel(BIG_CAPS);
		const noCache = await new TestInteractor(model2, id).run(input, { useCache: false });
		expect(model2.calls.length).toBe(1); // cache was bypassed
		expect(noCache.items).toHaveLength(2);
		expect(noCache.usedTokens).toBe(2);
		expect(noCache.cost).toBe(2);
	});

	test('useCache: false preserves item order', async () => {
		const model = new FakeModel({ maxInputTokens: 10_000, maxOutputTokens: 40 });
		const interactor = new TestInteractor(model, nextId());
		const input = Array.from({ length: 6 }, (_, i) => ({ id: i, payload: 'p' }));
		const { items } = await interactor.run(input, { useCache: false });

		expect(items).toHaveLength(6);
		input.forEach((it, i) => {
			expect(items[i]?.item.id).toBe(it.id);
		});
	});
});
