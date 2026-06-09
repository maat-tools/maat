import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModelCapabilities } from './base';
import { Gemini_3_5_Flash } from './gemini';

export const GeminiAIModel = {
	Gemini_3_5_Flash: 'gemini-3-5-flash',
} as const;

export type GeminiAIModel = (typeof GeminiAIModel)[keyof typeof GeminiAIModel];

export const LLMProvider = {
	Vertex: 'vertex',
} as const;

export type LLMProvider = (typeof LLMProvider)[keyof typeof LLMProvider];

type CloudLLMConfig = {
	timeoutMs?: number;
};

export type VertexLLMExtra = {
	project?: string;
	location?: string;
};

export interface ProviderModelRegistry {
	vertex: {
		'gemini-3-5-flash': VertexLLMExtra;
	};
}

export type LLMConfig<
	TProvider extends string = string,
	TModel extends string = string,
	TExtra extends Record<string, unknown> = Record<string, unknown>,
> = {
	provider: TProvider;
	model: TModel;
	extra?: TExtra;
} & CloudLLMConfig;

export type KnownLLMConfig = {
	[P in keyof ProviderModelRegistry]: {
		[M in keyof ProviderModelRegistry[P]]: {
			provider: P;
			model: M;
			extra?: ProviderModelRegistry[P][M];
		} & CloudLLMConfig;
	}[keyof ProviderModelRegistry[P]];
}[keyof ProviderModelRegistry];

type LLMInputBase = {
	prompt: string;
	context?: string;
	extraParams?: Record<string, unknown>;
};

export type LLMInput =
	| (LLMInputBase & { responseFormat?: 'text'; responseSchema?: never })
	| (LLMInputBase & { responseFormat: 'json'; responseSchema: Record<string, unknown> });

export type LLMOutput = {
	response: string;
	usedTokens: number;
	cost?: number;
};
export interface LLMModel {
	call(input: LLMInput): Promise<LLMOutput>;
	getCapabilities(): ModelCapabilities;
	isWithinTokenLimit(prompt: string): boolean;
	calculatePromptSize(prompt: string): number;
}

function buildModelInstance(config: LLMConfig): LLMModel {
	switch (config.provider) {
		case LLMProvider.Vertex:
			switch (config.model) {
				case GeminiAIModel.Gemini_3_5_Flash:
					return new Gemini_3_5_Flash(config as LLMConfig<'vertex', 'gemini-3-5-flash'>);
				default:
					throw new Error(`Unsupported Gemini model: ${config.model}`);
			}
		default:
			throw new Error(`Unsupported LLM provider: ${config.provider}`);
	}
}

type JsonSchema = {
	type?: string;
	properties?: Record<string, JsonSchema>;
	items?: JsonSchema;
};

type JsonArraySchema = JsonSchema & { type: 'array'; items: JsonSchema };

const SCHEMA_TOKEN_ESTIMATES = {
	boolean: 5,
	number: 5,
	string: 50,
	unknown: 20,
	objectBraces: 2,
	objectKeyOverhead: 4,
	arrayBrackets: 2,
	arrayItemMultiplier: 2,
	emptyArray: 10,
} as const;

function estimateSchemaTokens(schema: JsonSchema): number {
	switch (schema.type) {
		case 'boolean':
			return SCHEMA_TOKEN_ESTIMATES.boolean;
		case 'number':
			return SCHEMA_TOKEN_ESTIMATES.number;
		case 'string':
			return SCHEMA_TOKEN_ESTIMATES.string;
		case 'object': {
			const entries = Object.entries(schema.properties ?? {});
			const overhead = SCHEMA_TOKEN_ESTIMATES.objectKeyOverhead * entries.length + SCHEMA_TOKEN_ESTIMATES.objectBraces;

			return overhead + entries.reduce((sum, [, v]) => sum + estimateSchemaTokens(v), 0);
		}
		case 'array':
			return schema.items
				? estimateSchemaTokens(schema.items) * SCHEMA_TOKEN_ESTIMATES.arrayItemMultiplier +
						SCHEMA_TOKEN_ESTIMATES.arrayBrackets
				: SCHEMA_TOKEN_ESTIMATES.emptyArray;
		default:
			return SCHEMA_TOKEN_ESTIMATES.unknown;
	}
}

function getEnricherCacheDir(): string {
	return process.env.MAAT_ENRICHER_CACHE_DIR ?? join(process.cwd(), '.maat', 'enricher-cache');
}

function computeCacheKey(instructions: string, serialized: string, provider: string, model: string): string {
	return createHash('sha256').update(`${instructions}\n${serialized}\n${provider}/${model}`).digest('hex');
}

function enricherCacheDir(enricherId: string): string {
	return join(getEnricherCacheDir(), enricherId);
}

async function readCacheEntry<T>(enricherId: string, key: string): Promise<T | null> {
	try {
		const content = await readFile(join(enricherCacheDir(enricherId), `${key}.json`), 'utf-8');
		return JSON.parse(content) as T;
	} catch {
		return null;
	}
}

async function writeCacheEntry<T>(enricherId: string, key: string, value: T): Promise<void> {
	const dir = enricherCacheDir(enricherId);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, `${key}.json`), JSON.stringify(value), 'utf-8');
}

async function pruneStaleEntries(enricherId: string, usedKeys: Set<string>): Promise<void> {
	const dir = enricherCacheDir(enricherId);
	let files: string[];

	try {
		files = await readdir(dir);
	} catch {
		return;
	}

	await Promise.all(
		files.filter((f) => f.endsWith('.json') && !usedKeys.has(f.slice(0, -5))).map((f) => unlink(join(dir, f))),
	);
}

export abstract class LLMInteractor<TProvider extends string = string, TModel extends string = string> {
	protected config: LLMConfig<TProvider, TModel>;
	protected modelInstance: LLMModel;

	public constructor(config: LLMConfig<TProvider, TModel>) {
		this.config = config;
		this.modelInstance = buildModelInstance(config);
	}

	protected interact(input: LLMInput): Promise<LLMOutput> {
		return this.modelInstance.call(input);
	}

	protected async batchedInteract<TItem, TResult>({
		enricherId,
		items,
		instructions,
		serialize,
		serializeForCache,
		responseSchema,
	}: {
		enricherId: string;
		items: TItem[];
		instructions: string;
		serialize: (item: TItem) => string;
		serializeForCache?: (item: TItem) => string;
		responseSchema: JsonArraySchema;
	}): Promise<{ items: { item: TItem; result: TResult }[]; usedTokens: number; cost: number }> {
		if (items.length === 0) {
			return { items: [], usedTokens: 0, cost: 0 };
		}

		const keyOf = serializeForCache ?? serialize;
		const provider = this.config.provider as string;
		const model = this.config.model as string;

		const indexed = await Promise.all(
			items.map(async (item, originalIndex) => {
				const cacheKey = computeCacheKey(instructions, keyOf(item), provider, model);
				const cached = await readCacheEntry<TResult>(enricherId, cacheKey);
				return { originalIndex, item, cacheKey, cached };
			}),
		);

		const hits = indexed.filter((e) => e.cached !== null) as (typeof indexed)[number][];
		const misses = indexed.filter((e) => e.cached === null);

		for (const miss of misses) {
			process.stderr.write(`[maat:llm] cache miss ${miss.cacheKey.slice(0, 12)} (${model})\n`);
		}

		const cacheKeyByItem = new Map(misses.map((m) => [m.item, m.cacheKey]));
		const originalIndexByItem = new Map(misses.map((m) => [m.item, m.originalIndex]));

		const freshEntries: { originalIndex: number; item: TItem; result: TResult }[] = [];
		const freshKeys: string[] = [];
		let usedTokens = 0;
		let cost = 0;

		if (misses.length > 0) {
			const freshItems = misses.map((m) => m.item);
			const budget = this.computeBatchBudget(instructions, responseSchema);
			const batches = this.packBatches(freshItems, serialize, budget);
			const batchResults = await Promise.all(
				batches.map((batch) => this.executeBatch<TItem, TResult>(batch, instructions, serialize, responseSchema)),
			);

			const flatResults = batchResults.flatMap((r) => r.result);
			usedTokens = batchResults.reduce((sum, r) => sum + (r.usedTokens ?? 0), 0);
			cost = batchResults.reduce((sum, r) => sum + (r.cost ?? 0), 0);

			await Promise.all(
				flatResults.map(({ item, result }) => {
					const cacheKey = cacheKeyByItem.get(item);
					if (!cacheKey) {
						throw new Error('Cache key not found for item — this is a bug in batchedInteract');
					}
					freshKeys.push(cacheKey);
					return writeCacheEntry(enricherId, cacheKey, result);
				}),
			);

			for (const { item, result } of flatResults) {
				const originalIndex = originalIndexByItem.get(item);
				if (originalIndex === undefined) {
					throw new Error('Original index not found for item — this is a bug in batchedInteract');
				}
				freshEntries.push({ originalIndex, item, result });
			}
		}

		const usedKeys = new Set([...hits.map((h) => h.cacheKey), ...freshKeys]);
		await pruneStaleEntries(enricherId, usedKeys);

		const sortedItems = [
			...hits.map(({ originalIndex, item, cached }) => ({ originalIndex, item, result: cached as TResult })),
			...freshEntries,
		]
			.sort((a, b) => a.originalIndex - b.originalIndex)
			.map(({ item, result }) => ({ item, result }));

		return { items: sortedItems, usedTokens, cost };
	}

	private computeBatchBudget(
		instructions: string,
		responseSchema: JsonArraySchema,
	): { availableInputTokens: number; maxItemsByOutput: number } {
		const caps = this.modelInstance.getCapabilities();
		const fixedTokens = this.modelInstance.calculatePromptSize(instructions);
		const inputSafetyMargin = Math.ceil(caps.maxInputTokens * 0.2);
		const availableInputTokens = caps.maxInputTokens - fixedTokens - inputSafetyMargin;

		if (availableInputTokens <= 0) {
			throw new Error('Fixed prompt exceeds available input token budget');
		}

		const outputSafetyMargin = Math.ceil(caps.maxOutputTokens * 0.2);
		const availableOutputTokens = caps.maxOutputTokens - outputSafetyMargin;
		const estimatedOutputTokensPerItem = estimateSchemaTokens(responseSchema.items);
		const maxItemsByOutput = Math.floor(availableOutputTokens / estimatedOutputTokensPerItem);

		return { availableInputTokens, maxItemsByOutput };
	}

	private packBatches<TItem>(
		items: TItem[],
		serialize: (item: TItem) => string,
		budget: { availableInputTokens: number; maxItemsByOutput: number },
	): TItem[][] {
		const batches: TItem[][] = [];
		let current: TItem[] = [];
		let usedTokens = 0;

		for (const item of items) {
			const itemTokens = this.modelInstance.calculatePromptSize(serialize(item));
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

	private async executeBatch<TItem, TResult>(
		batch: TItem[],
		instructions: string,
		serialize: (item: TItem) => string,
		responseSchema: JsonArraySchema,
	): Promise<{ result: { item: TItem; result: TResult }[]; cost?: number; usedTokens?: number }> {
		const idxInstructions = `${instructions}\n\nEach result object must include "_idx": N where N is the item number from the corresponding "--- Item N ---" header.`;
		const wrappedSchema = {
			...responseSchema,
			items: {
				...responseSchema.items,
				properties: { _idx: { type: 'number' }, ...responseSchema.items.properties },
			},
		};
		const context = batch.map((item, i) => `--- Item ${i + 1} ---\n${serialize(item)}`).join('\n\n');

		const { response, cost, usedTokens } = await this.interact({
			prompt: idxInstructions,
			context,
			responseFormat: 'json',
			responseSchema: wrappedSchema,
		});

		const results = JSON.parse(response) as (TResult & { _idx: number })[];
		if (results.length !== batch.length) {
			throw new Error(`LLM returned ${results.length} results for a batch of ${batch.length} items`);
		}

		const byIdx = new Map(results.map((r) => [r._idx, r]));

		return {
			result: batch.map((item, i) => {
				const entry = byIdx.get(i + 1);
				if (!entry) {
					throw new Error(`LLM did not return a result for item ${i + 1}`);
				}

				const { _idx: _, ...result } = entry;

				return { item, result: result as unknown as TResult };
			}),
			cost,
			usedTokens,
		};
	}
}
