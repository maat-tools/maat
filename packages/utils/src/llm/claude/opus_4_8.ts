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

type Claude_Opus_4_8_Config = LLMConfig<
	SupportedProvider,
	typeof ClaudeAIModel.Claude_Opus_4_8,
	AnthropicLLMExtra | VertexLLMExtra | OpenRouterLLMExtra
>;

export class Claude_Opus_4_8 extends BaseClaudeModel implements LLMModel {
	protected override modelCapabilities: ModelCapabilities = {
		maxInputTokens: 1_000_000,
		maxOutputTokens: 128_000,
		cost: {
			inputTokenCost: 0.000005, // $5.00 per million tokens
			outputTokenCost: 0.000025, // $25.00 per million tokens
		},
	};

	protected override apiModelId: string;

	public constructor(config: Claude_Opus_4_8_Config) {
		super(config);

		if (config.model !== ClaudeAIModel.Claude_Opus_4_8) {
			throw new Error(`Invalid config for Claude Opus 4.8 model: ${config.model}`);
		}

		this.apiModelId = this.resolveApiModelId(config.provider);
	}

	private resolveApiModelId(provider: SupportedProvider): string {
		switch (provider) {
			case LLMProvider.Anthropic:
			case LLMProvider.Vertex:
				return 'claude-opus-4-8';
			case LLMProvider.OpenRouter:
				return 'anthropic/claude-opus-4.8';
			default:
				throw new Error(`Unsupported provider for Claude Opus 4.8 model: ${provider}`);
		}
	}
}
