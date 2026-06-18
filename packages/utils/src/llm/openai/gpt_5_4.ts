import { BaseOpenAICompatibleModel } from '../openai-compatible/base';
import {
	type LLMConfig,
	type LLMModel,
	LLMProvider,
	type ModelCapabilities,
	type OpenAILLMExtra,
	OpenAIModel,
	type OpenRouterLLMExtra,
} from '../types';

type SupportedProvider = typeof LLMProvider.OpenAI | typeof LLMProvider.OpenRouter;

type GPT_5_4_Config = LLMConfig<SupportedProvider, typeof OpenAIModel.GPT_5_4, OpenAILLMExtra | OpenRouterLLMExtra>;

export class GPT_5_4 extends BaseOpenAICompatibleModel implements LLMModel {
	protected override modelCapabilities: ModelCapabilities = {
		maxInputTokens: 1_000_000,
		maxOutputTokens: 128_000,
		cost: {
			inputTokenCost: 0.0000025, // $2.50 per million tokens
			outputTokenCost: 0.000015, // $15.00 per million tokens
		},
	};

	protected override apiModelId: string;

	public constructor(config: GPT_5_4_Config) {
		super(config);

		if (config.model !== OpenAIModel.GPT_5_4) {
			throw new Error(`Invalid config for GPT 5.4 model: ${config.model}`);
		}

		this.apiModelId = this.resolveApiModelId(config.provider);
	}

	private resolveApiModelId(provider: SupportedProvider): string {
		switch (provider) {
			case LLMProvider.OpenAI:
				return 'gpt-5.4-2026-03-05';
			case LLMProvider.OpenRouter:
				return 'openai/gpt-5.4';
			default:
				throw new Error(`Unsupported provider for GPT 5.4 model: ${provider}`);
		}
	}
}
