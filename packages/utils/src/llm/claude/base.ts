import Anthropic from '@anthropic-ai/sdk';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import OpenAI from 'openai';
import { BaseLLMModel } from '../base';
import {
	type AnthropicLLMExtra,
	type LLMConfig,
	type LLMInput,
	type LLMOutput,
	LLMProvider,
	type ModelCapabilities,
	type OpenRouterLLMExtra,
	type VertexLLMExtra,
} from '../types';

export type SupportedClaudeProvider =
	| typeof LLMProvider.Anthropic
	| typeof LLMProvider.Vertex
	| typeof LLMProvider.OpenRouter;

export abstract class BaseClaudeModel extends BaseLLMModel {
	protected abstract override modelCapabilities: ModelCapabilities;
	protected abstract apiModelId: string;

	private readonly config: LLMConfig<
		SupportedClaudeProvider,
		string,
		AnthropicLLMExtra | VertexLLMExtra | OpenRouterLLMExtra
	>;
	private readonly anthropicClient: Anthropic | AnthropicVertex | undefined;
	private readonly openAIClient: OpenAI | undefined;

	public constructor(
		config: LLMConfig<SupportedClaudeProvider, string, AnthropicLLMExtra | VertexLLMExtra | OpenRouterLLMExtra>,
	) {
		super();
		this.config = config;

		const { anthropicClient, openAIClient } = this.createClients(config);
		this.anthropicClient = anthropicClient;
		this.openAIClient = openAIClient;
	}

	public async call(input: LLMInput): Promise<LLMOutput> {
		if (this.anthropicClient) {
			return this.callWithAnthropic(input);
		}

		if (this.openAIClient) {
			return this.callWithOpenAI(input);
		}

		throw new Error('No client configured for Claude model');
	}

	public getCapabilities(): ModelCapabilities {
		return this.modelCapabilities;
	}

	private createClients(
		config: LLMConfig<SupportedClaudeProvider, string, AnthropicLLMExtra | VertexLLMExtra | OpenRouterLLMExtra>,
	): {
		anthropicClient?: Anthropic | AnthropicVertex;
		openAIClient?: OpenAI;
	} {
		if (config.provider === LLMProvider.Anthropic) {
			const extra = config.extra as AnthropicLLMExtra | undefined;
			return { anthropicClient: new Anthropic({ apiKey: extra?.apiKey }) };
		}

		if (config.provider === LLMProvider.Vertex) {
			const extra = config.extra as VertexLLMExtra | undefined;
			if (!extra?.project || !extra?.location) {
				throw new Error('Project and location must be specified in extra config for Vertex Claude model');
			}

			return { anthropicClient: new AnthropicVertex({ projectId: extra.project, region: extra.location }) };
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

		throw new Error(`Unsupported provider for Claude model: ${config.provider}`);
	}

	private async callWithAnthropic(input: LLMInput): Promise<LLMOutput> {
		if (!this.anthropicClient) {
			throw new Error('Anthropic client is not initialized');
		}

		const { prompt } = this.sanitize(input);
		const system = this.buildSystemPrompt(input);
		const useSchema = input.responseFormat === 'json' && input.responseSchema !== undefined;

		try {
			const result = await this.anthropicClient.messages.create(
				{
					model: this.apiModelId,
					max_tokens: this.modelCapabilities.maxOutputTokens,
					...(system ? { system } : {}),
					...(useSchema
						? {
								output_config: {
									format: {
										type: 'json_schema' as const,
										schema: this.buildStructuredOutputSchema(input.responseSchema as Record<string, unknown>),
									},
								},
							}
						: {}),
					messages: [
						{
							role: 'user',
							content: prompt,
						},
					],
				},
				{
					timeout: this.config.timeoutMs ?? 60000,
				},
			);

			const rawText = result.content
				.filter((block) => block.type === 'text')
				.map((block) => (block as Anthropic.TextBlock).text)
				.join('');
			const text = useSchema ? this.unwrapStructuredOutput(rawText) : rawText;

			return {
				response: text,
				usedTokens: result.usage
					? result.usage.input_tokens + result.usage.output_tokens
					: this.calculatePromptSize(prompt) + this.calculatePromptSize(text),
				cost: this.calculateInputCost(prompt) + this.calculateOutputCost(text),
			};
		} catch (e) {
			throw new Error(`Error calling Claude model ${this.apiModelId}: ${e}`);
		}
	}

	private async callWithOpenAI(input: LLMInput): Promise<LLMOutput> {
		if (!this.openAIClient) {
			throw new Error('OpenAI client is not initialized');
		}

		const { prompt } = this.sanitize(input);
		const useSchema = input.responseFormat === 'json' && input.responseSchema !== undefined;

		try {
			const result = await this.openAIClient.chat.completions.create(
				{
					model: this.apiModelId,
					messages: [
						{
							role: 'system',
							content: this.buildSystemPrompt(input),
						},
						{
							role: 'user',
							content: prompt,
						},
					],
					...(input.responseFormat === 'json'
						? {
								response_format: useSchema
									? {
											type: 'json_schema' as const,
											json_schema: {
												name: 'batch_response',
												schema: this.buildStructuredOutputSchema(input.responseSchema as Record<string, unknown>),
												strict: true,
											},
										}
									: { type: 'json_object' as const },
							}
						: {}),
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
			throw new Error(`Error calling Claude model ${this.apiModelId} via OpenRouter: ${e}`);
		}
	}

	private buildSystemPrompt(input: LLMInput): string {
		if (input.responseFormat === 'json') {
			return 'You must respond with valid JSON that matches the provided schema. Do not include markdown code fences or any explanatory text outside the JSON.';
		}

		return 'You are a helpful assistant.';
	}
}
