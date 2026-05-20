import { GPT4o } from './open-ai';

export const OpenAIModel = {
    GPT4o: 'gpt-4o',
    GPT4oMini: 'gpt-4o-mini',
} as const;

export type OpenAIModel = typeof OpenAIModel[keyof typeof OpenAIModel];


export const LLMProvider = {
    OpenAI: 'openai',
} as const;

export type LLMProvider = typeof LLMProvider[keyof typeof LLMProvider];

type CommonLLMConfig = {
    cacheDir?: string;
}

type CloudLLMConfig = {
    apiKey?: string;
    timeoutMs?: number;
    baseURL?: string;
} & CommonLLMConfig;

export type LLMConfig =
    | { provider: typeof LLMProvider.OpenAI; model: OpenAIModel } & CloudLLMConfig;


export interface LLMModel {
    call<TInput, TOutput>(input: TInput): Promise<TOutput>;
}

function buildModelInstance(config: LLMConfig): LLMModel {
    if (!Object.values(LLMProvider).includes(config.provider)) {
        throw new Error('Unsupported LLM provider');
    }

    if (config.provider === LLMProvider.OpenAI && !Object.values(OpenAIModel).includes(config.model as OpenAIModel)) {
        throw new Error('Unsupported OpenAI model');
    }

    switch (config.provider) {
        case LLMProvider.OpenAI:
            return new GPT4o();
        default:
            throw new Error('Unsupported LLM provider');
    }
}

export abstract class LLMInteractor {
    protected config: LLMConfig;
    private modelInstance: LLMModel;

    protected constructor(config: LLMConfig) {
        this.config = config;
        this.modelInstance = buildModelInstance(config);
    }

    protected interact<TInput, TOutput>(input: TInput): Promise<TOutput> {
        return this.modelInstance.call<TInput, TOutput>(input);
    }
}
