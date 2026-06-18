import {
	type AnthropicLLMExtra,
	ClaudeAIModel,
	type LLMConfig,
	type LLMModel,
	LLMProvider,
	type ModelCapabilities,
	type OpenRouterLLMExtra,
	type VertexLLMExtra,
} from '../types';
import { BaseClaudeModel } from './base';

type SupportedProvider = typeof LLMProvider.Anthropic | typeof LLMProvider.Vertex | typeof LLMProvider.OpenRouter;

type Claude_Haiku_4_5_Config = LLMConfig<
	SupportedProvider,
	typeof ClaudeAIModel.Claude_Haiku_4_5,
	AnthropicLLMExtra | VertexLLMExtra | OpenRouterLLMExtra
>;

export class Claude_Haiku_4_5 extends BaseClaudeModel implements LLMModel {
	protected override modelCapabilities: ModelCapabilities = {
		maxInputTokens: 200_000,
		maxOutputTokens: 64_000,
		cost: {
			inputTokenCost: 0.000001, // $1.00 per million tokens
			outputTokenCost: 0.000005, // $5.00 per million tokens
		},
	};

	protected override apiModelId: string;

	public constructor(config: Claude_Haiku_4_5_Config) {
		super(config);

		if (config.model !== ClaudeAIModel.Claude_Haiku_4_5) {
			throw new Error(`Invalid config for Claude Haiku 4.5 model: ${config.model}`);
		}

		this.apiModelId = this.resolveApiModelId(config.provider);
	}

	private resolveApiModelId(provider: SupportedProvider): string {
		switch (provider) {
			case LLMProvider.Anthropic:
			case LLMProvider.Vertex:
				return 'claude-haiku-4-5';
			case LLMProvider.OpenRouter:
				return 'anthropic/claude-haiku-4.5';
			default:
				throw new Error(`Unsupported provider for Claude Haiku 4.5 model: ${provider}`);
		}
	}
}
