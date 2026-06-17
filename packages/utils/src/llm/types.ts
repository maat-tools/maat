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
