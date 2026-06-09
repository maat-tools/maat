import type { LLMInput } from '.';

export type ModelCapabilities = {
	maxInputTokens: number;
	maxOutputTokens: number;
	cost?: {
		inputTokenCost: number;
		outputTokenCost: number;
	};
};

export abstract class BaseLLMModel {
	protected abstract modelCapabilities: ModelCapabilities;

	protected sanitize(input: LLMInput): LLMInput {
		let prompt = `<instructions>${input.prompt}</instructions>`;

		if (input.context) {
			prompt += `\n<context>${input.context}</context>`;
		}

		return { ...input, prompt };
	}

	public isWithinTokenLimit(prompt: string): boolean {
		const promptTokens = this.calculatePromptSize(prompt);

		return promptTokens <= this.modelCapabilities.maxInputTokens;
	}

	public calculatePromptSize(prompt: string): number {
		// Simple token estimation: 1 token ~ 4 characters in English
		return Math.ceil(prompt.length / 4);
	}

	protected calculateInputCost(prompt: string): number {
		const promptTokens = this.calculatePromptSize(prompt);

		if (this.modelCapabilities.cost?.inputTokenCost === undefined) {
			return 0;
		}

		return promptTokens * (this.modelCapabilities.cost?.inputTokenCost ?? 0);
	}

	protected calculateOutputCost(response: string): number {
		const outputTokens = this.calculatePromptSize(response);

		if (this.modelCapabilities.cost?.outputTokenCost === undefined) {
			return 0;
		}

		return outputTokens * (this.modelCapabilities.cost?.outputTokenCost ?? 0);
	}
}
