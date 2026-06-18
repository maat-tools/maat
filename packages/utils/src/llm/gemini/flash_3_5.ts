import {
	GeminiAIModel,
	type GoogleLLMExtra,
	type LLMConfig,
	type LLMModel,
	LLMProvider,
	type ModelCapabilities,
	type OpenRouterLLMExtra,
	type VertexLLMExtra,
} from '../types';
import { BaseGeminiModel } from './base';

type SupportedProvider = typeof LLMProvider.Vertex | typeof LLMProvider.Google | typeof LLMProvider.OpenRouter;

type Gemini_3_5_Flash_Config = LLMConfig<
	SupportedProvider,
	typeof GeminiAIModel.Gemini_3_5_Flash,
	VertexLLMExtra | GoogleLLMExtra | OpenRouterLLMExtra
>;

export class Gemini_3_5_Flash extends BaseGeminiModel implements LLMModel {
	protected override modelCapabilities: ModelCapabilities = {
		maxInputTokens: 1_000_000,
		maxOutputTokens: 65_536,
		cost: {
			inputTokenCost: 0.0000015, // $1.50 per million tokens
			outputTokenCost: 0.000009, // $9.00 per million tokens
		},
	};

	protected override apiModelId: string;

	public constructor(config: Gemini_3_5_Flash_Config) {
		super(config);

		if (config.model !== GeminiAIModel.Gemini_3_5_Flash) {
			throw new Error(`Invalid config for Gemini 3.5 Flash model: ${config.model}`);
		}

		this.apiModelId = this.resolveApiModelId(config.provider);
	}

	private resolveApiModelId(provider: SupportedProvider): string {
		switch (provider) {
			case LLMProvider.Vertex:
			case LLMProvider.Google:
				return 'gemini-3.5-flash';
			case LLMProvider.OpenRouter:
				return 'google/gemini-3.5-flash';
			default:
				throw new Error(`Unsupported provider for Gemini 3.5 Flash model: ${provider}`);
		}
	}
}
