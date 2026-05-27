import type { Collector, Enricher, FindingRuleOutput, Rule } from '@maat-tools/contracts';
import { Kernel } from '@maat-tools/kernel';
import '../facts';


export function makeCollector(items: string[], id = 'test-collector'): Collector<'testFacts'> {
	return {
		id,
		provideFacts: ['testFacts'] as const,
		collect: async () => ({ testFacts: items }),
	};
}


export function makeRule(id = 'rule@v1'): Rule<'testFacts'> {
	return {
		id,
		needFacts: ['testFacts'] as const,
		evaluate: ({ testFacts }) =>
			testFacts.map((value, i) => ({
				ruleId: id,
				ruleIdentifier: { value, i },
				message: `finding: ${value}`,
				artifacts: [],
			})),
		describeArtifact: (artifact) => ({ value: String(artifact.data) }),
	};
}

export function makeEnricher(): Enricher<'testFacts', 'enrichedFacts'> {
	return {
		id: 'test-enricher',
		needFacts: ['testFacts'] as const,
		provideFacts: ['enrichedFacts'] as const,
		enrich: async ({ testFacts }) => ({
			enrichedFacts: testFacts.map((v) => `enriched:${v}`),
		}),
	};
}

export function makeKernel(findings: FindingRuleOutput[] = []): Kernel {
	const kernel = new Kernel();
	kernel.registerRule({
		id: 'test@v1',
		needFacts: [] as const,
		evaluate: () => findings,
		describeArtifact: (artifact) => ({ value: String(artifact.data) }),
	});
	return kernel;
}
