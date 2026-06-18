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

type Gemini_3_1_Pro_Config = LLMConfig<
	SupportedProvider,
	typeof GeminiAIModel.Gemini_3_1_Pro_Preview,
	VertexLLMExtra | GoogleLLMExtra | OpenRouterLLMExtra
>;

export class Gemini_3_1_Pro_Preview extends BaseGeminiModel implements LLMModel {
	protected override modelCapabilities: ModelCapabilities = {
		maxInputTokens: 1_000_000,
		maxOutputTokens: 64_000,
		cost: {
			inputTokenCost: 0.000002, // $2.00 per million tokens
			outputTokenCost: 0.000012, // $12.00 per million tokens
		},
	};

	protected override apiModelId: string;

	public constructor(config: Gemini_3_1_Pro_Config) {
		super(config);

		if (config.model !== GeminiAIModel.Gemini_3_1_Pro_Preview) {
			throw new Error(`Invalid config for Gemini 3.1 Pro Preview model: ${config.model}`);
		}

		this.apiModelId = this.resolveApiModelId(config.provider);
	}

	private resolveApiModelId(provider: SupportedProvider): string {
		switch (provider) {
			case LLMProvider.Vertex:
			case LLMProvider.Google:
				return 'gemini-3.1-pro-preview';
			case LLMProvider.OpenRouter:
				return 'google/gemini-3.1-pro-preview';
			default:
				throw new Error(`Unsupported provider for Gemini 3.1 Pro Preview model: ${provider}`);
		}
	}
}
