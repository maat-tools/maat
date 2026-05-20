import type { LLMModel } from '..';

export class GPT4o implements LLMModel {
	public call<TInput, TOutput>(_input: TInput): Promise<TOutput> {
		// Implement the call logic for GPT-4o model
		return Promise.resolve({} as TOutput);
	}
}
