import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { LLMInteractor, type LLMConfig, type LLMInput, type LLMOutput, type LLMModel } from '.';
import type { ModelCapabilities } from './base';

let testCacheDir: string;
beforeEach(() => {
	testCacheDir = join(tmpdir(), `maat-test-${Math.floor(Math.random() * 1_000_000)}`);
	process.env.MAAT_ENRICHER_CACHE_DIR = testCacheDir;
});
afterEach(() => {
	delete process.env.MAAT_ENRICHER_CACHE_DIR;
	try { rmSync(testCacheDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

type FakeItem = { id: number; payload: string };
type FakeResult = { score: number };

const FAKE_ITEM_SCHEMA = {
	type: 'array' as const,
	items: {
		type: 'object' as const,
		properties: {
			score: { type: 'number' as const },
		},
		required: ['score'],
	},
};

function makeFakeModel(capabilities: ModelCapabilities, respond: (batch: FakeItem[]) => FakeResult[]): LLMModel {
	return {
		getCapabilities: () => capabilities,
		isWithinTokenLimit: (prompt) => Math.ceil(prompt.length / 4) <= capabilities.maxInputTokens,
		calculatePromptSize: (prompt) => Math.ceil(prompt.length / 4),
		call: async (input: LLMInput): Promise<LLMOutput> => {
			const count = (input.context?.match(/--- Item \d+ ---/g) ?? []).length;
			const items = Array.from({ length: count }, (_, i) => ({ id: i, payload: '' }));
			const results = respond(items).map((r, i) => ({ ...r, _idx: i + 1 }));
			return { response: JSON.stringify(results), usedTokens: 0 };
		},
	};
}

class TestInteractor extends LLMInteractor {
	public constructor(fakeModel: LLMModel) {
		super({ provider: 'vertex', model: 'gemini-3-5-flash', extra: { project: 'test', location: 'us-central1' } } as LLMConfig);
		this.modelInstance = fakeModel;
	}

	public async runBatchedInteract(items: FakeItem[]): Promise<{ item: FakeItem; result: FakeResult }[]> {
		const { items: results } = await this.batchedInteract<FakeItem, FakeResult>({
			enricherId: 'test',
			items,
			instructions: 'Rate each item.',
			serialize: (item) => `id:${item.id} payload:${item.payload}`,
			responseSchema: FAKE_ITEM_SCHEMA,
		});
		return results;
	}
}

function makeItems(count: number, payloadLength = 4): FakeItem[] {
	return Array.from({ length: count }, (_, i) => ({
		id: i,
		payload: 'x'.repeat(payloadLength),
	}));
}

function respondWithScores(items: FakeItem[]): FakeResult[] {
	return items.map((_, i) => ({ score: i }));
}

describe('batchedInteract — batching logic', () => {
	test('all items fit in one batch when under token limits', async () => {
		const model = makeFakeModel(
			{ maxInputTokens: 10_000, maxOutputTokens: 10_000 },
			respondWithScores,
		);
		const callCount = { value: 0 };
		const wrappedModel: LLMModel = {
			...model,
			call: async (input) => {
				callCount.value++;
				return model.call(input);
			},
		};

		const interactor = new TestInteractor(wrappedModel);
		const items = makeItems(5);
		const results = await interactor.runBatchedInteract(items);

		expect(callCount.value).toBe(1);
		expect(results).toHaveLength(5);
	});

	test('splits into multiple batches when input token limit is tight', async () => {
		const model = makeFakeModel(
			{ maxInputTokens: 50, maxOutputTokens: 10_000 },
			respondWithScores,
		);
		const calls: number[] = [];
		const wrappedModel: LLMModel = {
			...model,
			call: async (input) => {
				const count = (input.context?.match(/--- Item \d+ ---/g) ?? []).length;
				calls.push(count);
				return model.call(input);
			},
		};

		const interactor = new TestInteractor(wrappedModel);
		const results = await interactor.runBatchedInteract(makeItems(6, 40));

		expect(calls.length).toBeGreaterThan(1);
		expect(calls.reduce((s, n) => s + n, 0)).toBe(6);
		expect(results).toHaveLength(6);
	});

	test('splits into multiple batches when output token limit is tight', async () => {
		const model = makeFakeModel(
			{ maxInputTokens: 10_000, maxOutputTokens: 22 },
			respondWithScores,
		);
		const calls: number[] = [];
		const wrappedModel: LLMModel = {
			...model,
			call: async (input) => {
				const count = (input.context?.match(/--- Item \d+ ---/g) ?? []).length;
				calls.push(count);
				return model.call(input);
			},
		};

		const interactor = new TestInteractor(wrappedModel);
		const results = await interactor.runBatchedInteract(makeItems(5));

		expect(calls.every((n) => n <= 2)).toBe(true);
		expect(results).toHaveLength(5);
	});

	test('preserves item order across batches', async () => {
		const model = makeFakeModel(
			{ maxInputTokens: 50, maxOutputTokens: 10_000 },
			respondWithScores,
		);
		const interactor = new TestInteractor(model);
		const items = makeItems(6, 40);
		const results = await interactor.runBatchedInteract(items);

		for (let i = 0; i < items.length; i++) {
			expect(results[i]?.item.id).toBe(items[i]?.id);
		}
	});

	test('returns empty array for empty input', async () => {
		const model = makeFakeModel({ maxInputTokens: 10_000, maxOutputTokens: 10_000 }, respondWithScores);
		const interactor = new TestInteractor(model);
		const results = await interactor.runBatchedInteract([]);
		expect(results).toEqual([]);
	});

	test('throws when instructions exceed input token budget', async () => {
		const model = makeFakeModel({ maxInputTokens: 1, maxOutputTokens: 10_000 }, respondWithScores);
		const interactor = new TestInteractor(model);
		expect(interactor.runBatchedInteract(makeItems(1))).rejects.toThrow('Fixed prompt exceeds available input token budget');
	});

	test('throws when LLM returns wrong number of results', async () => {
		const model = makeFakeModel(
			{ maxInputTokens: 10_000, maxOutputTokens: 10_000 },
			() => [{ score: 0 }],
		);
		const interactor = new TestInteractor(model);
		expect(interactor.runBatchedInteract(makeItems(3))).rejects.toThrow(/LLM returned 1 results for a batch of 3 items/);
	});
});

describe('batchedInteract — result mapping', () => {
	test('each result is paired with its source item', async () => {
		const model = makeFakeModel(
			{ maxInputTokens: 10_000, maxOutputTokens: 10_000 },
			(items) => items.map((_, i) => ({ score: i * 10 })),
		);
		const interactor = new TestInteractor(model);
		const items = makeItems(4);
		const results = await interactor.runBatchedInteract(items);

		for (let i = 0; i < items.length; i++) {
			expect(results[i]?.item).toBe(items[i]);
			expect(results[i]?.result.score).toBe(i * 10);
		}
	});

	test('correctly matches items when LLM returns results out of order', async () => {
		const model = makeFakeModel(
			{ maxInputTokens: 10_000, maxOutputTokens: 10_000 },
			(items) => items.map((_, i) => ({ score: i * 10 })),
		);
		const reversedModel: LLMModel = {
			...model,
			call: async (input) => {
				const { response } = await model.call(input);
				const results = JSON.parse(response) as { score: number; _idx: number }[];
				return { response: JSON.stringify(results.toReversed()), usedTokens: 0 };
			},
		};

		const interactor = new TestInteractor(reversedModel);
		const items = makeItems(4);
		const results = await interactor.runBatchedInteract(items);

		for (let i = 0; i < items.length; i++) {
			expect(results[i]?.item).toBe(items[i]);
			expect(results[i]?.result.score).toBe(i * 10);
		}
	});

	test('throws when LLM omits _idx for an item', async () => {
		const model: LLMModel = {
			getCapabilities: () => ({ maxInputTokens: 10_000, maxOutputTokens: 10_000 }),
			isWithinTokenLimit: () => true,
			calculatePromptSize: (p) => Math.ceil(p.length / 4),
			call: async () => ({
				response: JSON.stringify([{ score: 0, _idx: 1 }, { score: 1 }]),
				usedTokens: 0,
			}),
		};
		const interactor = new TestInteractor(model);
		expect(interactor.runBatchedInteract(makeItems(2))).rejects.toThrow('LLM did not return a result for item 2');
	});
});
