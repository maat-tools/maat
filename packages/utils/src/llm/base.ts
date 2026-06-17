import type { JsonArraySchema, JsonSchema, LLMInput, ModelCapabilities } from './types';

export abstract class BaseLLMModel {
	protected abstract modelCapabilities: ModelCapabilities;

	private SCHEMA_TOKEN_ESTIMATES = {
		boolean: 5,
		number: 5,
		string: 50,
		unknown: 20,
		objectBraces: 2,
		objectKeyOverhead: 6,
		arrayBrackets: 2,
		arrayItemMultiplier: 2,
		emptyArray: 10,
	} as const;

	protected sanitize(input: LLMInput): LLMInput {
		let prompt = `<instructions>${input.prompt}</instructions>`;

		if (input.context) {
			prompt += `\n<context>${input.context}</context>`;
		}

		return { ...input, prompt };
	}

	public isWithinTokenLimit(prompt: string): boolean {
		const promptTokens = this.calculatePromptSize(prompt);

		return promptTokens <= this.modelCapabilities.maxInputTokens;
	}

	public calculatePromptSize(prompt: string): number {
		// Simple token estimation: 1 token ~ 4 characters in English
		return Math.ceil(prompt.length / 4);
	}

	public computeBatchBudget(
		instructions: string,
		responseSchema: JsonArraySchema,
	): { availableInputTokens: number; maxItemsByOutput: number } {
		const caps = this.modelCapabilities;
		const fixedTokens = this.calculatePromptSize(instructions);
		const inputSafetyMargin = Math.ceil(caps.maxInputTokens * 0.1);
		const availableInputTokens = caps.maxInputTokens - fixedTokens - inputSafetyMargin;

		if (availableInputTokens <= 0) {
			throw new Error('Fixed prompt exceeds available input token budget');
		}

		const outputSafetyMargin = Math.ceil(caps.maxOutputTokens * 0.15);
		const availableOutputTokens = caps.maxOutputTokens - outputSafetyMargin;
		const estimatedOutputTokensPerItem = this.estimateSchemaTokens(responseSchema.items);
		const maxItemsByOutput = Math.max(1, Math.floor(availableOutputTokens / estimatedOutputTokensPerItem));

		return { availableInputTokens, maxItemsByOutput };
	}

	protected calculateInputCost(prompt: string): number {
		const promptTokens = this.calculatePromptSize(prompt);

		if (this.modelCapabilities.cost?.inputTokenCost === undefined) {
			return 0;
		}

		return promptTokens * (this.modelCapabilities.cost?.inputTokenCost ?? 0);
	}

	protected calculateOutputCost(response: string): number {
		const outputTokens = this.calculatePromptSize(response);

		if (this.modelCapabilities.cost?.outputTokenCost === undefined) {
			return 0;
		}

		return outputTokens * (this.modelCapabilities.cost?.outputTokenCost ?? 0);
	}

	private estimateSchemaTokens(schema: JsonSchema): number {
		switch (schema.type) {
			case 'boolean':
				return this.SCHEMA_TOKEN_ESTIMATES.boolean;
			case 'number':
				return this.SCHEMA_TOKEN_ESTIMATES.number;
			case 'string':
				return this.SCHEMA_TOKEN_ESTIMATES.string;
			case 'object': {
				const entries = Object.entries(schema.properties ?? {});
				const overhead =
					this.SCHEMA_TOKEN_ESTIMATES.objectKeyOverhead * entries.length + this.SCHEMA_TOKEN_ESTIMATES.objectBraces;

				return overhead + entries.reduce((sum, [, v]) => sum + this.estimateSchemaTokens(v), 0);
			}
			case 'array':
				return schema.items
					? this.estimateSchemaTokens(schema.items) * this.SCHEMA_TOKEN_ESTIMATES.arrayItemMultiplier +
							this.SCHEMA_TOKEN_ESTIMATES.arrayBrackets
					: this.SCHEMA_TOKEN_ESTIMATES.emptyArray;
			default:
				return this.SCHEMA_TOKEN_ESTIMATES.unknown;
		}
	}
}
