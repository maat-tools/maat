import { describe, expect, test } from 'bun:test';
import { BaseLLMModel } from './base';
import { BatchLLMRequest } from './batch';
import type { JsonArraySchema, LLMInput, LLMModel, LLMOutput, ModelCapabilities } from './types';

const SCORE_SCHEMA: JsonArraySchema = {
	type: 'array',
	items: {
		type: 'object',
		properties: { score: { type: 'number' } },
	},
};

type Responder = (keys: string[]) => Array<Record<string, unknown>>;

class FakeModel extends BaseLLMModel implements LLMModel {
	public lastInput?: LLMInput;
	protected modelCapabilities: ModelCapabilities;

	public constructor(
		caps: ModelCapabilities,
		private responder: Responder = (keys) => keys.map((k, i) => ({ _key: k, score: i })),
	) {
		super();
		this.modelCapabilities = caps;
	}

	public getCapabilities(): ModelCapabilities {
		return this.modelCapabilities;
	}

	public async call(input: LLMInput): Promise<LLMOutput> {
		this.lastInput = input;
		const keys = [...(input.context ?? '').matchAll(/--- Item \d+ \(key: ([^)]+)\) ---/g)].map((m) => m[1] as string);
		return { response: JSON.stringify(this.responder(keys)), usedTokens: keys.length, cost: keys.length };
	}
}

const BIG_CAPS: ModelCapabilities = { maxInputTokens: 1000, maxOutputTokens: 1000 };

function packItems(count: number, len = 4): { serialized: string; identifier: string; orderingHash: string }[] {
	return Array.from({ length: count }, (_, i) => ({
		serialized: 'x'.repeat(len),
		identifier: `k${i}`,
		orderingHash: `h${i}`,
	}));
}

describe('BatchLLMRequest.packBatchesBasedOnModelCapacity', () => {
	test('packs everything into one batch when it fits', () => {
		const req = new BatchLLMRequest(new FakeModel(BIG_CAPS));
		const batches = req.packBatchesBasedOnModelCapacity(packItems(5), {
			availableInputTokens: 1000,
			maxItemsByOutput: 100,
		});
		expect(batches).toHaveLength(1);
		expect(batches[0]).toHaveLength(5);
	});

	test('splits when the input token budget is tight', () => {
		const req = new BatchLLMRequest(new FakeModel(BIG_CAPS));
		// 40 chars -> 10 tokens each; budget 25 -> 2 items per batch
		const batches = req.packBatchesBasedOnModelCapacity(packItems(6, 40), {
			availableInputTokens: 25,
			maxItemsByOutput: 100,
		});
		expect(batches).toHaveLength(3);
		expect(batches.flat()).toHaveLength(6);
	});

	test('splits when the output item cap is tight', () => {
		const req = new BatchLLMRequest(new FakeModel(BIG_CAPS));
		const batches = req.packBatchesBasedOnModelCapacity(packItems(5), {
			availableInputTokens: 1000,
			maxItemsByOutput: 2,
		});
		expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
	});

	test('returns no batches for empty input', () => {
		const req = new BatchLLMRequest(new FakeModel(BIG_CAPS));
		expect(req.packBatchesBasedOnModelCapacity([], { availableInputTokens: 1000, maxItemsByOutput: 100 })).toEqual([]);
	});
});

describe('BatchLLMRequest.packBatchesBasedOnModelCapacity — boundary math', () => {
	const req = new BatchLLMRequest(new FakeModel(BIG_CAPS));
	const sized = (chars: number, id: string) => ({ serialized: 'x'.repeat(chars), identifier: id, orderingHash: id });

	test('an item whose tokens exactly hit the remaining budget still fits (uses >, not >=)', () => {
		// two items, 10 tokens each (40 chars); 10 + 10 == 20 budget -> one batch
		const batches = req.packBatchesBasedOnModelCapacity([sized(40, 'a'), sized(40, 'b')], {
			availableInputTokens: 20,
			maxItemsByOutput: 100,
		});
		expect(batches).toHaveLength(1);
		expect(batches[0]).toHaveLength(2);
	});

	test('a single item larger than the entire input budget is kept, not dropped', () => {
		const batches = req.packBatchesBasedOnModelCapacity([sized(400, 'big')], {
			availableInputTokens: 5, // item is 100 tokens
			maxItemsByOutput: 100,
		});
		expect(batches).toHaveLength(1);
		expect(batches[0]).toHaveLength(1);
	});

	test('consecutive oversized items each land in their own batch', () => {
		const batches = req.packBatchesBasedOnModelCapacity([sized(400, 'a'), sized(400, 'b')], {
			availableInputTokens: 5,
			maxItemsByOutput: 100,
		});
		expect(batches.map((b) => b.length)).toEqual([1, 1]);
	});

	test('maxItemsByOutput of 1 puts every item in its own batch', () => {
		const batches = req.packBatchesBasedOnModelCapacity(packItems(3), {
			availableInputTokens: 1000,
			maxItemsByOutput: 1,
		});
		expect(batches.map((b) => b.length)).toEqual([1, 1, 1]);
	});

	test('the running input total resets after a split', () => {
		// 10 tokens each, budget 25: [a,b]=20 ok, +c=30 > 25 -> split -> [2, 1]
		const batches = req.packBatchesBasedOnModelCapacity(packItems(3, 40), {
			availableInputTokens: 25,
			maxItemsByOutput: 100,
		});
		expect(batches.map((b) => b.length)).toEqual([2, 1]);
	});
});

describe('BatchLLMRequest.executeBatch', () => {
	const batch = [
		{ serialized: 'AAA', identifier: 'k1' },
		{ serialized: 'BBB', identifier: 'k2' },
	];

	test('maps each result back to its item by _key, strips _key, and reports cost/tokens', async () => {
		const model = new FakeModel(BIG_CAPS);
		const out = await new BatchLLMRequest(model).executeBatch({
			batch,
			orderingHashes: ['k1', 'k2'],
			instructions: 'do it',
			responseSchema: SCORE_SCHEMA,
		});

		expect(out.result).toHaveLength(2);
		expect(out.result[0]?.item).toBe(batch[0]);
		expect(out.result[1]?.item).toBe(batch[1]);
		expect(out.result[0]?.result).toEqual({ score: 0 });
		expect(out.result[1]?.result).toEqual({ score: 1 });
		expect(out.usedTokens).toBe(2);
		expect(out.cost).toBe(2);
	});

	test('builds a keyed context and wraps the schema with a _key property', async () => {
		const model = new FakeModel(BIG_CAPS);
		await new BatchLLMRequest(model).executeBatch({
			batch,
			orderingHashes: ['k1', 'k2'],
			instructions: 'do it',
			responseSchema: SCORE_SCHEMA,
		});

		const input = model.lastInput;
		expect(input?.context).toContain('(key: k1)');
		expect(input?.context).toContain('AAA');
		expect(input?.responseFormat).toBe('json');
		if (input?.responseFormat === 'json') {
			const wrapped = input.responseSchema as { items: { properties: Record<string, unknown> } };
			expect(wrapped.items.properties).toHaveProperty('_key');
		}
	});

	test('matches items even when the model returns results out of order', async () => {
		const model = new FakeModel(BIG_CAPS, (keys) => keys.map((k, i) => ({ _key: k, score: i })).reverse());
		const out = await new BatchLLMRequest(model).executeBatch({
			batch,
			orderingHashes: ['k1', 'k2'],
			instructions: 'i',
			responseSchema: SCORE_SCHEMA,
		});
		expect(out.result[0]?.result).toEqual({ score: 0 });
		expect(out.result[1]?.result).toEqual({ score: 1 });
	});

	test('throws when batch and keys lengths differ', async () => {
		const model = new FakeModel(BIG_CAPS);
		await expect(
			new BatchLLMRequest(model).executeBatch({
				batch,
				orderingHashes: ['k1'],
				instructions: 'i',
				responseSchema: SCORE_SCHEMA,
			}),
		).rejects.toThrow('Batch and keys must have the same length');
	});

	test('throws when the model returns the wrong number of results', async () => {
		const model = new FakeModel(BIG_CAPS, (keys) => [{ _key: keys[0], score: 0 }]);
		await expect(
			new BatchLLMRequest(model).executeBatch({
				batch,
				orderingHashes: ['k1', 'k2'],
				instructions: 'i',
				responseSchema: SCORE_SCHEMA,
			}),
		).rejects.toThrow('LLM returned 1 results for a batch of 2 items');
	});

	test('throws when a result is missing for a key', async () => {
		const model = new FakeModel(BIG_CAPS, (keys) => keys.map((_, i) => ({ _key: `wrong-${i}`, score: i })));
		await expect(
			new BatchLLMRequest(model).executeBatch({
				batch,
				orderingHashes: ['k1', 'k2'],
				instructions: 'i',
				responseSchema: SCORE_SCHEMA,
			}),
		).rejects.toThrow('LLM did not return a result for item');
	});
});
