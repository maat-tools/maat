import OpenAI from 'openai';
import { BaseLLMModel } from '../base';
import {
	type LLMConfig,
	type LLMInput,
	type LLMModel,
	type LLMOutput,
	LLMProvider,
	type ModelCapabilities,
	type OpenAILLMExtra,
	type OpenRouterLLMExtra,
	type VertexLLMExtra,
	type XAILLMExtra,
} from '../types';

export type SupportedOpenAICompatibleProvider =
	| typeof LLMProvider.OpenAI
	| typeof LLMProvider.XAI
	| typeof LLMProvider.OpenRouter
	| typeof LLMProvider.Vertex;

export abstract class BaseOpenAICompatibleModel extends BaseLLMModel implements LLMModel {
	protected abstract override modelCapabilities: ModelCapabilities;
	protected abstract apiModelId: string;

	private readonly client: OpenAI;

	public constructor(
		private config: LLMConfig<
			SupportedOpenAICompatibleProvider,
			string,
			OpenAILLMExtra | XAILLMExtra | OpenRouterLLMExtra | VertexLLMExtra
		>,
	) {
		super();

		this.client = this.createClient();
	}

	public async call(input: LLMInput): Promise<LLMOutput> {
		const { prompt } = this.sanitize(input);

		const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{
				role: 'system',
				content: this.buildSystemPrompt(input),
			},
			{
				role: 'user',
				content: prompt,
			},
		];

		const useSchema = input.responseFormat === 'json' && input.responseSchema !== undefined;
		const responseFormat = this.buildResponseFormat(input);

		try {
			const result = await this.client.chat.completions.create(
				{
					model: this.apiModelId,
					messages,
					...(responseFormat ? { response_format: responseFormat } : {}),
				},
				{
					timeout: this.config.timeoutMs ?? 60000,
				},
			);

			const rawText = result.choices[0]?.message.content ?? '';
			const text = useSchema ? this.unwrapStructuredOutput(rawText) : rawText;

			return {
				response: text,
				usedTokens: result.usage?.total_tokens ?? this.calculatePromptSize(prompt) + this.calculatePromptSize(text),
				cost: this.calculateInputCost(prompt) + this.calculateOutputCost(text),
			};
		} catch (e) {
			throw new Error(`Error calling ${this.apiModelId} model: ${e}`);
		}
	}

	public getCapabilities(): ModelCapabilities {
		return this.modelCapabilities;
	}

	private createClient(): OpenAI {
		const { provider } = this.config;

		if (provider === LLMProvider.OpenAI) {
			const extra = this.config.extra as OpenAILLMExtra | undefined;
			return new OpenAI({ apiKey: extra?.apiKey, baseURL: extra?.baseUrl });
		}

		if (provider === LLMProvider.XAI) {
			const extra = this.config.extra as XAILLMExtra | undefined;
			return new OpenAI({ apiKey: extra?.apiKey, baseURL: 'https://api.x.ai/v1' });
		}

		if (provider === LLMProvider.OpenRouter) {
			const extra = this.config.extra as OpenRouterLLMExtra | undefined;
			return new OpenAI({
				apiKey: extra?.apiKey,
				baseURL: extra?.baseUrl ?? 'https://openrouter.ai/api/v1',
				defaultHeaders: {
					'HTTP-Referer': 'https://maat-tools.github.io/maat/',
					'X-Title': 'maat',
				},
			});
		}

		if (provider === LLMProvider.Vertex) {
			const extra = this.config.extra as VertexLLMExtra | undefined;
			if (!extra?.project || !extra?.location) {
				throw new Error('Project and location must be specified in extra config for Vertex model');
			}

			return new OpenAI({
				apiKey: extra.project,
				baseURL: `https://${extra.location}-aiplatform.googleapis.com/v1/projects/${extra.project}/locations/${extra.location}/publishers/openai/models`,
			});
		}

		throw new Error(`Unsupported provider for OpenAI-compatible model: ${provider}`);
	}

	private buildResponseFormat(input: LLMInput): OpenAI.Chat.Completions.ChatCompletionCreateParams['response_format'] {
		if (input.responseFormat !== 'json') {
			return undefined;
		}

		if (input.responseSchema === undefined) {
			return { type: 'json_object' };
		}

		return {
			type: 'json_schema',
			json_schema: {
				name: 'batch_response',
				schema: this.buildStructuredOutputSchema(input.responseSchema),
				strict: true,
			},
		};
	}

	private buildSystemPrompt(input: LLMInput): string {
		if (input.responseFormat === 'json') {
			return 'You must respond with valid JSON that matches the provided schema. Do not include markdown code fences or any explanatory text outside the JSON.';
		}

		return 'You are a helpful assistant.';
	}
}
