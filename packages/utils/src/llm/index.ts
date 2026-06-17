import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { LocalCache } from '../cache';
import { BatchLLMRequest } from './batch';
import { VertexGemini_3_5_Flash } from './gemini';
import { GeminiAIModel, type JsonArraySchema, type LLMConfig, type LLMModel, LLMProvider } from './types';

export * from './types';

function buildModelInstance(config: LLMConfig): LLMModel {
	switch (config.provider) {
		case LLMProvider.Vertex:
			switch (config.model) {
				case GeminiAIModel.Gemini_3_5_Flash:
					return new VertexGemini_3_5_Flash(config as LLMConfig<'vertex', 'gemini-3-5-flash'>);
				default:
					throw new Error(`Unsupported Gemini model: ${config.model}`);
			}
		default:
			throw new Error(`Unsupported LLM provider: ${config.provider}`);
	}
}

export abstract class LLMInteractor<TProvider extends string = string, TModel extends string = string> {
	protected config: LLMConfig<TProvider, TModel>;
	protected modelInstance: LLMModel;
	private batchRequest: BatchLLMRequest;

	private cache = new LocalCache({ cachePath: 'enrichers' });

	protected abstract id: string;
	protected abstract serializeItem(item: unknown): string;

	public constructor(config: LLMConfig<TProvider, TModel>) {
		this.config = config;
		this.modelInstance = buildModelInstance(config);
		this.batchRequest = new BatchLLMRequest(this.modelInstance);
	}

	protected async batchedInteract<TItem, TResult>({
		items,
		instructions,
		responseSchema,
		options = { useCache: true },
	}: {
		items: TItem[];
		instructions: string;
		responseSchema: JsonArraySchema;
		options?: { useCache?: boolean };
	}): Promise<{
		items: {
			item: TItem;
			result: TResult;
		}[];
		usedTokens: number;
		cost: number;
	}> {
		if (items.length === 0) {
			return { items: [], usedTokens: 0, cost: 0 };
		}

		let usedTokens = 0;
		let cost = 0;
		if (!options.useCache) {
			const budget = this.modelInstance.computeBatchBudget(instructions, responseSchema);
			const itemsForBatching = items.map((item, index) => ({
				serialized: this.serializeItem(item),
				identifier: this.createHash(this.serializeItem(item)),
				orderingHash: this.createHash(String(index)),
				originalIndex: index,
				original: item,
			}));
			const batches = this.batchRequest.packBatchesBasedOnModelCapacity(itemsForBatching, budget);

			const batchResults = await Promise.all(
				batches.map(async (batch) =>
					this.batchRequest.executeBatch<
						{ serialized: string; identifier: string; orderingHash: string; originalIndex: number; original: TItem },
						TResult
					>({
						batch,
						orderingHashes: batch.map((item) => item.orderingHash),
						instructions,
						responseSchema,
					}),
				),
			);

			const flatResults = batchResults.flatMap((r) => r.result);
			({ usedTokens, cost } = this.calculateLLMCost(batchResults));

			const sortedItems = flatResults
				.sort((a, b) => a.item.originalIndex - b.item.originalIndex)
				.map(({ item, result }) => ({ item: item.original, result }));

			return { items: sortedItems, usedTokens, cost };
		}

		const CACHE_FOLDER = `enrichers/${this.id}`;
		const provider = this.config.provider;
		const model = this.config.model;

		const indexed = await Promise.all(
			items.map(async (item, originalIndex) => {
				const serialized = this.serializeItem(item);
				const cacheKey = this.computeHashForCacheItem({ instructions, serialized, provider, model });
				const cached = await this.cache.readCacheEntry<TResult>(join(CACHE_FOLDER, `${cacheKey}.json`));

				return { originalIndex, item, serialized, cacheKey, cached };
			}),
		);

		const hits = indexed.filter((e) => e.cached !== null);
		const missedItems = indexed.filter((e) => e.cached === null);

		const usedKeys = new Set([...hits.map((h) => h.cacheKey)]);

		const freshEntries: { originalIndex: number; item: TItem; result: TResult }[] = [];

		if (missedItems.length > 0) {
			const budget = this.modelInstance.computeBatchBudget(instructions, responseSchema);
			const itemsForBatching = missedItems.map((e) => ({
				serialized: e.serialized,
				identifier: e.cacheKey,
				orderingHash: this.createHash(String(e.originalIndex)),
				originalIndex: e.originalIndex,
				original: e.item,
			}));
			const batches = this.batchRequest.packBatchesBasedOnModelCapacity(itemsForBatching, budget);

			const batchResults = await Promise.all(
				batches.map(async (batch) =>
					this.batchRequest.executeBatch<
						{ serialized: string; identifier: string; orderingHash: string; originalIndex: number; original: TItem },
						TResult
					>({
						batch,
						orderingHashes: batch.map((item) => item.orderingHash),
						instructions,
						responseSchema,
					}),
				),
			);

			const flatResults = batchResults.flatMap((r) => r.result);
			({ usedTokens, cost } = this.calculateLLMCost(batchResults));

			await Promise.all(
				flatResults.map(({ item, result }) =>
					this.cache.writeCacheEntry(CACHE_FOLDER, `${item.identifier}.json`, result),
				),
			);

			flatResults.forEach(({ item, result }) => {
				freshEntries.push({ originalIndex: item.originalIndex, item: item.original, result });
				usedKeys.add(item.identifier);
			});
		}

		await this.cleanUpUnusedCacheEntries(usedKeys, CACHE_FOLDER);

		const sortedItems = [
			...hits.map(({ originalIndex, item, cached }) => ({ originalIndex, item, result: cached as TResult })),
			...freshEntries,
		]
			.sort((a, b) => a.originalIndex - b.originalIndex)
			.map(({ item, result }) => ({ item, result }));

		return { items: sortedItems, usedTokens, cost };
	}

	private calculateLLMCost(batchResults: { usedTokens?: number; cost?: number }[]): {
		usedTokens: number;
		cost: number;
	} {
		const usedTokens = batchResults.reduce((sum, r) => sum + (r.usedTokens ?? 0), 0);
		const cost = batchResults.reduce((sum, r) => sum + (r.cost ?? 0), 0);

		return {
			usedTokens,
			cost,
		};
	}

	private async cleanUpUnusedCacheEntries(usedKeys: Set<string>, dir: string): Promise<void> {
		const cacheFilesForEnricher = await this.cache.getFileList(dir);

		const toDelete = cacheFilesForEnricher.filter((f) => {
			const key = f.split('.json').shift();
			if (!key) {
				return false;
			}

			return !usedKeys.has(key);
		});

		await Promise.all(toDelete.map((f) => this.cache.deleteEntry(join(dir, f))));
	}

	private computeHashForCacheItem({
		instructions,
		serialized,
		provider,
		model,
	}: {
		instructions: string;
		serialized: string;
		provider: string;
		model: string;
	}) {
		return this.createHash(`${instructions}\n${serialized}\n${provider}/${model}`);
	}

	private createHash(input: string): string {
		return createHash('sha256').update(input).digest('hex');
	}
}
