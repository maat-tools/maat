import type { JsonArraySchema, LLMModel } from './types';

export class BatchLLMRequest {
	public constructor(private modelInstance: LLMModel) {}

	public packBatchesBasedOnModelCapacity<TItem>(
		items: (TItem & { serialized: string; identifier: string; orderingHash: string })[],
		budget: { availableInputTokens: number; maxItemsByOutput: number },
	): (TItem & { serialized: string; identifier: string; orderingHash: string })[][] {
		const batches: (TItem & { serialized: string; identifier: string; orderingHash: string })[][] = [];
		let current: (TItem & { serialized: string; identifier: string; orderingHash: string })[] = [];
		let usedTokens = 0;

		for (const item of items) {
			const itemTokens = this.modelInstance.calculatePromptSize(item.serialized);
			const wouldExceedInput = current.length > 0 && usedTokens + itemTokens > budget.availableInputTokens;
			const wouldExceedOutput = current.length >= budget.maxItemsByOutput;

			if (wouldExceedInput || wouldExceedOutput) {
				batches.push(current);
				current = [item];
				usedTokens = itemTokens;
			} else {
				current.push(item);
				usedTokens += itemTokens;
			}
		}

		if (current.length > 0) {
			batches.push(current);
		}

		return batches;
	}

	public async executeBatch<TItem, TResult>(
		batch: (TItem & { serialized: string; identifier: string })[],
		orderingHashes: string[],
		instructions: string,
		responseSchema: JsonArraySchema,
	): Promise<{ result: { item: TItem; result: TResult }[]; cost?: number; usedTokens?: number }> {
		if (batch.length !== orderingHashes.length) {
			throw new Error('Batch and keys must have the same length');
		}

		const keyInstructions = `${instructions}\n\nEach result object must include "_key": K where K is the key from the corresponding "--- Item N (key: K) ---" header.`;
		const wrappedSchema = {
			...responseSchema,
			items: {
				...responseSchema.items,
				properties: { _key: { type: 'string' }, ...(responseSchema.items.properties ?? {}) },
			},
		};
		const context = batch
			.map((item, i) => `--- Item ${i + 1} (key: ${orderingHashes[i]}) ---\n${item.serialized}`)
			.join('\n\n');

		const { response, cost, usedTokens } = await this.modelInstance.call({
			prompt: keyInstructions,
			context,
			responseFormat: 'json',
			responseSchema: wrappedSchema,
		});

		let results = [];

		try {
			results = JSON.parse(response) as (TResult & { _key: string })[];
		} catch (e) {
			throw new Error(`Failed to parse LLM response as JSON: ${e}\nResponse was: ${response}`);
		}

		if (results.length !== batch.length) {
			throw new Error(`LLM returned ${results.length} results for a batch of ${batch.length} items`);
		}

		const byKey = new Map(results.map((r) => [r._key, r]));

		return {
			result: batch.map((item, i) => {
				const key = orderingHashes[i];
				if (!key) {
					throw new Error('Key is undefined — this is a bug in executeBatch');
				}

				const entry = byKey.get(key);
				if (!entry) {
					throw new Error(`LLM did not return a result for item ${i + 1} (key: ${key})`);
				}

				const { _key: _, ...result } = entry;

				return { item, result: result as unknown as TResult };
			}),
			cost,
			usedTokens,
		};
	}
}
