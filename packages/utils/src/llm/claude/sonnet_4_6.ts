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

type Claude_Sonnet_4_6_Config = LLMConfig<
	SupportedProvider,
	typeof ClaudeAIModel.Claude_Sonnet_4_6,
	AnthropicLLMExtra | VertexLLMExtra | OpenRouterLLMExtra
>;

export class Claude_Sonnet_4_6 extends BaseClaudeModel implements LLMModel {
	protected override modelCapabilities: ModelCapabilities = {
		maxInputTokens: 1_000_000,
		maxOutputTokens: 64_000,
		cost: {
			inputTokenCost: 0.000003, // $3.00 per million tokens
			outputTokenCost: 0.000015, // $15.00 per million tokens
		},
	};

	protected override apiModelId: string;

	public constructor(config: Claude_Sonnet_4_6_Config) {
		super(config);

		if (config.model !== ClaudeAIModel.Claude_Sonnet_4_6) {
			throw new Error(`Invalid config for Claude Sonnet 4.6 model: ${config.model}`);
		}

		this.apiModelId = this.resolveApiModelId(config.provider);
	}

	private resolveApiModelId(provider: SupportedProvider): string {
		switch (provider) {
			case LLMProvider.Anthropic:
			case LLMProvider.Vertex:
				return 'claude-sonnet-4-6';
			case LLMProvider.OpenRouter:
				return 'anthropic/claude-sonnet-4.6';
			default:
				throw new Error(`Unsupported provider for Claude Sonnet 4.6 model: ${provider}`);
		}
	}
}
