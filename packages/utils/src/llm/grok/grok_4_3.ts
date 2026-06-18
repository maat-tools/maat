import { BaseOpenAICompatibleModel } from '../openai-compatible/base';
import {
	GrokAIModel,
	type LLMConfig,
	type LLMModel,
	LLMProvider,
	type ModelCapabilities,
	type OpenRouterLLMExtra,
	type VertexLLMExtra,
	type XAILLMExtra,
} from '../types';

type SupportedProvider = typeof LLMProvider.XAI | typeof LLMProvider.Vertex | typeof LLMProvider.OpenRouter;

type Grok_4_3_Config = LLMConfig<
	SupportedProvider,
	typeof GrokAIModel.Grok_4_3,
	XAILLMExtra | VertexLLMExtra | OpenRouterLLMExtra
>;

export class Grok_4_3 extends BaseOpenAICompatibleModel implements LLMModel {
	protected override modelCapabilities: ModelCapabilities = {
		maxInputTokens: 1_000_000,
		maxOutputTokens: 131_000,
		cost: {
			inputTokenCost: 0.00000125, // $1.25 per million tokens
			outputTokenCost: 0.0000025, // $2.50 per million tokens
		},
	};

	protected override apiModelId: string;

	public constructor(config: Grok_4_3_Config) {
		super(config);

		if (config.model !== GrokAIModel.Grok_4_3) {
			throw new Error(`Invalid config for Grok 4.3 model: ${config.model}`);
		}

		this.apiModelId = this.resolveApiModelId(config.provider);
	}

	private resolveApiModelId(provider: SupportedProvider): string {
		switch (provider) {
			case LLMProvider.XAI:
				return 'grok-4.3';
			case LLMProvider.Vertex:
				return 'xai/grok-4.3';
			case LLMProvider.OpenRouter:
				return 'x-ai/grok-4.3';
			default:
				throw new Error(`Unsupported provider for Grok 4.3 model: ${provider}`);
		}
	}
}
