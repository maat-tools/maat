import { type GenerateContentConfig, GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { BaseLLMModel } from '../base';
import {
	type GoogleLLMExtra,
	type LLMConfig,
	type LLMInput,
	type LLMOutput,
	LLMProvider,
	type ModelCapabilities,
	type OpenRouterLLMExtra,
	type VertexLLMExtra,
} from '../types';

export type SupportedGeminiProvider =
	| typeof LLMProvider.Vertex
	| typeof LLMProvider.Google
	| typeof LLMProvider.OpenRouter;

export abstract class BaseGeminiModel extends BaseLLMModel {
	protected abstract override modelCapabilities: ModelCapabilities;
	protected abstract apiModelId: string;

	private readonly config: LLMConfig<
		SupportedGeminiProvider,
		string,
		VertexLLMExtra | GoogleLLMExtra | OpenRouterLLMExtra
	>;
	private readonly googleClient: GoogleGenAI | undefined;
	private readonly openAIClient: OpenAI | undefined;

	public constructor(
		config: LLMConfig<SupportedGeminiProvider, string, VertexLLMExtra | GoogleLLMExtra | OpenRouterLLMExtra>,
	) {
		super();
		this.config = config;

		const { client: googleClient, openAIClient } = this.createClients(config);
		this.googleClient = googleClient;
		this.openAIClient = openAIClient;
	}

	public async call(input: LLMInput): Promise<LLMOutput> {
		if (this.googleClient) {
			return this.callWithGoogleGenAI(input);
		}

		if (this.openAIClient) {
			return this.callWithOpenAI(input);
		}

		throw new Error('No client configured for Gemini model');
	}

	public getCapabilities(): ModelCapabilities {
		return this.modelCapabilities;
	}

	private createClients(
		config: LLMConfig<SupportedGeminiProvider, string, VertexLLMExtra | GoogleLLMExtra | OpenRouterLLMExtra>,
	): {
		client?: GoogleGenAI;
		openAIClient?: OpenAI;
	} {
		if (config.provider === LLMProvider.Vertex) {
			const extra = config.extra as VertexLLMExtra | undefined;
			if (!extra?.project || !extra?.location) {
				throw new Error('Project and location must be specified in extra config for Vertex Gemini model');
			}

			return {
				client: new GoogleGenAI({ vertexai: true, project: extra.project, location: extra.location }),
			};
		}

		if (config.provider === LLMProvider.Google) {
			const extra = config.extra as GoogleLLMExtra | undefined;
			return { client: new GoogleGenAI({ apiKey: extra?.apiKey }) };
		}

		if (config.provider === LLMProvider.OpenRouter) {
			const extra = config.extra as OpenRouterLLMExtra | undefined;
			return {
				openAIClient: new OpenAI({
					apiKey: extra?.apiKey,
					baseURL: extra?.baseUrl ?? 'https://openrouter.ai/api/v1',
					defaultHeaders: {
						'HTTP-Referer': 'https://maat-tools.github.io/maat/',
						'X-Title': 'maat',
					},
				}),
			};
		}

		throw new Error(`Unsupported provider for Gemini model: ${config.provider}`);
	}

	private async callWithGoogleGenAI(input: LLMInput): Promise<LLMOutput> {
		if (!this.googleClient) {
			throw new Error('Google GenAI client is not initialized');
		}

		const { prompt } = this.sanitize(input);
		const generationConfig: GenerateContentConfig = {
			temperature: 0,
			httpOptions: { timeout: this.config.timeoutMs ?? 60000 },
			...(input.responseFormat === 'json'
				? {
						responseMimeType: 'application/json' as const,
						responseSchema: input.responseSchema,
					}
				: {}),
		};

		try {
			const result = await this.googleClient.models.generateContent({
				model: this.apiModelId,
				contents: prompt,
				config: generationConfig,
			});

			const text = result.text ?? '';

			return {
				response: text,
				usedTokens: this.calculatePromptSize(prompt) + this.calculatePromptSize(text),
				cost: this.calculateInputCost(prompt) + this.calculateOutputCost(text),
			};
		} catch (e) {
			throw new Error(`Error calling Gemini model ${this.apiModelId}: ${e}`);
		}
	}

	private async callWithOpenAI(input: LLMInput): Promise<LLMOutput> {
		if (!this.openAIClient) {
			throw new Error('OpenAI client is not initialized');
		}

		const { prompt } = this.sanitize(input);

		try {
			const result = await this.openAIClient.chat.completions.create(
				{
					model: this.apiModelId,
					messages: [
						{
							role: 'system',
							content:
								input.responseFormat === 'json'
									? 'You must respond with valid JSON that matches the provided schema. Do not include markdown code fences or any explanatory text outside the JSON.'
									: 'You are a helpful assistant.',
						},
						{
							role: 'user',
							content: prompt,
						},
					],
					temperature: 0,
					...(input.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
				},
				{
					timeout: this.config.timeoutMs ?? 60000,
				},
			);

			const text = result.choices[0]?.message.content ?? '';

			return {
				response: text,
				usedTokens: result.usage?.total_tokens ?? this.calculatePromptSize(prompt) + this.calculatePromptSize(text),
				cost: this.calculateInputCost(prompt) + this.calculateOutputCost(text),
			};
		} catch (e) {
			throw new Error(`Error calling Gemini model ${this.apiModelId} via OpenRouter: ${e}`);
		}
	}
}
