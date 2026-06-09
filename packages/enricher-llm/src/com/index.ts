import { defineEnricher, type Enricher } from '@maat-tools/contracts';
import { type KnownLLMConfig, type LLMConfig, LLMInteractor } from '@maat-tools/utils';
import { FUNCTION_SIGNATURES_CAPABILITY, type FunctionSignature } from '@maat-tools/vocabulary';

export type CoMCandidate = {
	signature: FunctionSignature;
	confidence: number;
	reason: string;
};

export const COM_ENRICHER_FACT_KEY = 'comCandidates' as const;

const COM_BATCH_RESPONSE_SCHEMA = {
	type: 'array',
	items: {
		type: 'object',
		properties: {
			isCoM: { type: 'boolean' },
			confidence: { type: 'number' },
			reason: { type: 'string' },
		},
		required: ['isCoM', 'confidence', 'reason'],
	},
} as const satisfies { type: 'array'; items: object };

type CoMAssessment = {
	isCoM: boolean;
	confidence: number;
	reason: string;
};

const COM_INSTRUCTIONS = `You are a software architect analyzing code for Connascence of Meaning (CoM).

Connascence of Meaning (CoM) occurs when multiple components must agree on the meaning of specific values. A caller cannot correctly use a function's return value without out-of-band knowledge of what each possible value means.

This manifests in two key patterns:

**Pattern 1 — overloaded literals:** A function returns different literal values to represent distinct semantic states. The caller must know the mapping: which value means "success", which means "not found", which means "error". This mapping lives nowhere in the type system.

**Pattern 2 — overloaded absence sentinels:** A function uses the same sentinel value (an "empty", "absent", or "nothing" value in the language) to signal more than one distinct outcome — for instance, using it both when an entity does not exist and when an operation failed. The caller cannot distinguish the two cases without additional context.

The root problem in both patterns is the same: a single value carries multiple distinct meanings, and every caller must independently know which meaning applies. This hidden coupling is CoM. It can be resolved by making the distinction explicit in the return contract — using named constants, enums, discriminated types, or explicit result objects.

For each function listed below, assess whether it exhibits CoM. Consider:
1. Do any two return sites carry the same value but represent different outcomes (e.g. the same sentinel used for "not found" and for "error")?
2. Does the function return different literals to encode distinct states, where the mapping is implicit rather than captured in the type?
3. Would a caller need out-of-band knowledge — a comment, a convention, or tribal knowledge — to correctly interpret the return value?

Respond with a JSON array with one assessment object per function:
[{ "isCoM": <boolean — true if CoM is present>, "confidence": <number 0.0–1.0>, "reason": <concise explanation> }]`;

declare module '@maat-tools/contracts' {
	interface FactRegistry {
		comCandidates: CoMCandidate[];
	}
	interface EnricherRegistry {
		'@maat-tools/enricher-llm/com': KnownLLMConfig;
	}
}

export class CoMEnricherLLM
	extends LLMInteractor
	implements Enricher<'functionSignatures', typeof COM_ENRICHER_FACT_KEY>
{
	public id = 'maat-tools/enricher-llm/com@v1';
	public needFacts = [FUNCTION_SIGNATURES_CAPABILITY] as const;
	public provideFacts = [COM_ENRICHER_FACT_KEY] as const;

	public constructor(config: KnownLLMConfig) {
		super(config as LLMConfig);
	}

	public async enrich({
		functionSignatures,
	}: {
		functionSignatures: FunctionSignature[];
	}): Promise<{ facts: { comCandidates: CoMCandidate[] }; usedTokens?: number; cost?: number }> {
		const heterogeneousCandidates = functionSignatures.filter((sig) => sig.output.heterogeneous);
		if (heterogeneousCandidates.length === 0) {
			return { facts: { comCandidates: [] } };
		}

		const duplicateReturnValueCandidates = heterogeneousCandidates.filter(
			(sig) => new Set(sig.output.returnSites.map((site) => site.value)).size !== sig.output.returnSites.length,
		);

		const { items, usedTokens, cost } = await this.batchedInteract<FunctionSignature, CoMAssessment>({
			enricherId: this.id,
			items: duplicateReturnValueCandidates,
			instructions: COM_INSTRUCTIONS,
			serialize: this.serializeSignature.bind(this),
			serializeForCache: this.serializeForCache.bind(this),
			responseSchema: COM_BATCH_RESPONSE_SCHEMA,
		});

		const comCandidates = items
			.filter(({ result }) => result.isCoM)
			.map(({ item, result }) => ({
				signature: item,
				confidence: result.confidence,
				reason: result.reason,
			}));

		return { facts: { comCandidates }, usedTokens, cost };
	}

	private serializeForCache(sig: FunctionSignature): string {
		const sites = sig.output.returnSites
			.map((site) => `${site.value}${site.guardSnippet ? `[${site.guardSnippet}]` : ''}`)
			.join('|');

		return `${sig.name}|${sig.output.returnType}|${sites}`;
	}

	private serializeSignature(sig: FunctionSignature): string {
		const returnSiteLines = sig.output.returnSites
			.map((site, i) => {
				const guard = site.guardSnippet ? ` [guard: ${site.guardSnippet}]` : '';
				return `  ${i + 1}. returns \`${site.value}\`${guard} at line ${site.location.line}`;
			})
			.join('\n');

		return `Function: \`${sig.name}\`
File: ${sig.file}:${sig.location.line}
Return type: \`${sig.output.returnType}\`
Return sites (${sig.output.returnSites.length} total):
${returnSiteLines}`;
	}
}

export default defineEnricher((config: KnownLLMConfig) => new CoMEnricherLLM(config));
