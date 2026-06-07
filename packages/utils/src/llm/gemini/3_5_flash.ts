import { GoogleGenAI } from '@google/genai';
import { GeminiAIModel, type LLMConfig, type LLMInput, type LLMModel, type LLMOutput, type VertexLLMExtra } from '..';
import { BaseLLMModel, type ModelCapabilities } from '../base';

type GeminiConfig = LLMConfig<'vertex', 'gemini-3-5-flash', VertexLLMExtra>;

const MODEL_ID = 'gemini-3.5-flash';

export class Gemini_3_5_Flash extends BaseLLMModel implements LLMModel {
	protected override modelCapabilities: ModelCapabilities = {
		maxInputTokens: 1_000_000,
		maxOutputTokens: 65_536,
		cost: {
			inputTokenCost: 0.0000015,  // $1.50 per million tokens
			outputTokenCost: 0.000009,  // $9.00 per million tokens
		},
	}

	private readonly ai: GoogleGenAI;

	public constructor(config: GeminiConfig) {
		super();
		
		if (config.provider !== 'vertex' || config.model !== GeminiAIModel.Gemini_3_5_Flash) {
			throw new Error('Invalid config for Gemini 3.5 Flash model');
		}

		if (!config.extra?.project || !config.extra?.location) {
			throw new Error('Project and location must be specified in extra config for Gemini 3.5 Flash model');
		}

		const { project, location } = config.extra;

		this.ai = new GoogleGenAI({ vertexai: true, project, location });
	}

	public async call(input: LLMInput): Promise<LLMOutput> {
		const { prompt } = this.sanitize(input);
		const generationConfig = {
			temperature: 0,
			...(input.responseFormat === 'json'
				? {
					responseMimeType: 'application/json' as const,
					responseSchema: input.responseSchema,
				}
				: {}),
		};

		try {
			const result = await this.ai.models.generateContent({
				model: MODEL_ID,
				contents: prompt,
				config: generationConfig,
			});

			const text = result.text ?? '';

			return {
				response: text,
				usedTokens: this.calculatePromptSize(prompt) + this.calculatePromptSize(text),
				cost: this.calculateInputCost(prompt) + this.calculateOutputCost(text)
			};
		} catch (e) {
			console.error('Error calling Gemini 3.5 Flash model:', e);
			throw new Error('Error calling Gemini 3.5 Flash model');
		}
	}

	public getCapabilities(): ModelCapabilities {
		return this.modelCapabilities;
	}
}
