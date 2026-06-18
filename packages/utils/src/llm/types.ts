export const GeminiAIModel = {
	Gemini_3_5_Flash: 'gemini-3-5-flash',
	Gemini_3_1_Pro_Preview: 'gemini-3-1-pro-preview',
} as const;

export type GeminiAIModel = (typeof GeminiAIModel)[keyof typeof GeminiAIModel];

export const ClaudeAIModel = {
	Claude_Sonnet_4_6: 'claude-sonnet-4-6',
	Claude_Opus_4_8: 'claude-opus-4-8',
	Claude_Haiku_4_5: 'claude-haiku-4-5',
} as const;

export type ClaudeAIModel = (typeof ClaudeAIModel)[keyof typeof ClaudeAIModel];

export const GrokAIModel = {
	Grok_4_3: 'grok-4-3',
} as const;

export type GrokAIModel = (typeof GrokAIModel)[keyof typeof GrokAIModel];

export const OpenAIModel = {
	GPT_5_4: 'gpt-5-4',
	GPT_5_5: 'gpt-5-5',
} as const;

export type OpenAIModel = (typeof OpenAIModel)[keyof typeof OpenAIModel];

export const LLMProvider = {
	Vertex: 'vertex',
	Google: 'google',
	Anthropic: 'anthropic',
	XAI: 'xai',
	OpenAI: 'openai',
	OpenRouter: 'openrouter',
} as const;

export type LLMProvider = (typeof LLMProvider)[keyof typeof LLMProvider];

type CloudLLMConfig = {
	timeoutMs?: number;
};

export type VertexLLMExtra = {
	project?: string;
	location?: string;
};

export type GoogleLLMExtra = {
	apiKey?: string;
};

export type AnthropicLLMExtra = {
	apiKey?: string;
};

export type XAILLMExtra = {
	apiKey?: string;
};

export type OpenAILLMExtra = {
	apiKey?: string;
	baseUrl?: string;
};

export type OpenRouterLLMExtra = {
	apiKey?: string;
	baseUrl?: string;
};

export interface ProviderModelRegistry {
	vertex: {
		'gemini-3-5-flash': VertexLLMExtra;
		'gemini-3-1-pro-preview': VertexLLMExtra;
		'claude-sonnet-4-6': VertexLLMExtra;
		'claude-opus-4-8': VertexLLMExtra;
		'claude-haiku-4-5': VertexLLMExtra;
		'grok-4-3': VertexLLMExtra;
	};
	google: {
		'gemini-3-5-flash': GoogleLLMExtra;
		'gemini-3-1-pro-preview': GoogleLLMExtra;
	};
	anthropic: {
		'claude-sonnet-4-6': AnthropicLLMExtra;
		'claude-opus-4-8': AnthropicLLMExtra;
		'claude-haiku-4-5': AnthropicLLMExtra;
	};
	xai: {
		'grok-4-3': XAILLMExtra;
	};
	openai: {
		'gpt-5-4': OpenAILLMExtra;
		'gpt-5-5': OpenAILLMExtra;
	};
	openrouter: {
		'gemini-3-5-flash': OpenRouterLLMExtra;
		'gemini-3-1-pro-preview': OpenRouterLLMExtra;
		'claude-sonnet-4-6': OpenRouterLLMExtra;
		'claude-opus-4-8': OpenRouterLLMExtra;
		'claude-haiku-4-5': OpenRouterLLMExtra;
		'grok-4-3': OpenRouterLLMExtra;
		'gpt-5-4': OpenRouterLLMExtra;
		'gpt-5-5': OpenRouterLLMExtra;
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

export type ModelCapabilities = {
	maxInputTokens: number;
	maxOutputTokens: number;
	cost?: {
		inputTokenCost: number;
		outputTokenCost: number;
	};
};

export type JsonSchema = {
	type: string;
	properties?: Record<string, JsonSchema>;
	items?: JsonSchema;
};

export type JsonArraySchema = JsonSchema & { type: 'array'; items: JsonSchema };

export interface LLMModel {
	call(input: LLMInput): Promise<LLMOutput>;
	getCapabilities(): ModelCapabilities;
	isWithinTokenLimit(prompt: string): boolean;
	calculatePromptSize(prompt: string): number;
	computeBatchBudget(
		instructions: string,
		responseSchema: JsonArraySchema,
	): { availableInputTokens: number; maxItemsByOutput: number };
}
