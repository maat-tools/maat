import { defineEnricher, type Enricher } from '@maat-tools/contracts';
import '@maat-tools/vocabulary';
import { LLMInteractor } from '@maat-tools/utils';
import type { EnricherLLMInput } from '../shared/types';

export type COACandidate = unknown;

declare module '@maat-tools/contracts' {
	interface FactRegistry {
		coaCandidates: COACandidate[];
	}
	interface EnricherRegistry {
		'@maat-tools/enricher-llm/coa': EnricherLLMInput;
	}
}

export class CoAEnricherLLM extends LLMInteractor implements Enricher<'functionSignatures', 'coaCandidates'> {
	public id = 'coa';
	public needFacts = [] as const;
	public provideFacts = [] as const;

	public async enrich(_facts: unknown) {
		return { coaCandidates: [] };
	}
}

export default defineEnricher((config: EnricherLLMInput) => new CoAEnricherLLM(config));
