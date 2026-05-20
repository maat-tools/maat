import { defineEnricher, type Enricher } from '@maat-tools/contracts';
import '@maat-tools/vocabulary';
import type { EnricherLLMInput } from '../shared/types';
import { LLMInteractor } from '@maat-tools/utils';

export type COACandidate = {};

declare module '@maat-tools/contracts' {
	interface FactRegistry {
		coaCandidates: COACandidate[];
	}
	interface EnricherRegistry {
		'@maat-tools/enricher-llm/coa': EnricherLLMInput;
	}
}

export class CoAEnricherLLM extends LLMInteractor implements Enricher<'functionSignatures', 'coaCandidates'> {

	public constructor(config: EnricherLLMInput) {
		super(config);
	}

	public id = 'coa';
	public needFacts = [] as const;
	public provideFacts = [] as const;

	public async enrich(facts: {  }) {
		return { coaCandidates: [] };
	}

}

export default defineEnricher((config: EnricherLLMInput) => new CoAEnricherLLM(config));
