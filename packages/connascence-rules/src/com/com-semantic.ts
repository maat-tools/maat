import { type Artifact, defineRule, type RuleOutput, type Rule } from '@maat-tools/contracts';
import { COM_ENRICHER_FACT_KEY, type CoMCandidate } from '@maat-tools/enricher-llm/com';

export type CoMSemanticRuleOptions = {
	threshold: `0.${string}` | '1';
};

declare module '@maat-tools/contracts' {
	interface RuleRegistry {
		'@maat-tools/connascence-rules/com-semantic': CoMSemanticRuleOptions;
	}
}

export class ConnascenceOfMeaningSemanticRule implements Rule<typeof COM_ENRICHER_FACT_KEY> {
	public readonly id = 'maat-tools/connascence-rules/com-semantic@v1';
	public readonly instanceId = this.id;
	public readonly needFacts = [COM_ENRICHER_FACT_KEY] as const;

	private readonly threshold: number;

	public constructor(options?: CoMSemanticRuleOptions) {
		if (!options?.threshold) {
			throw new Error('Threshold option is required for ConnascenceOfMeaningSemanticRule');
		}
		this.threshold = Number(options.threshold);
	}

	public evaluate(facts: { comCandidates: CoMCandidate[] }): RuleOutput[] {
		const comCandidates = facts[COM_ENRICHER_FACT_KEY] ?? [];
		const findings: RuleOutput[] = [];

		for (const candidate of comCandidates) {
			if (candidate.confidence < this.threshold) {
				continue;
			}

			const value = candidate.signature.output.returnSites.reduce((acc, site) => {
				const siteValue = site.guardSnippet ? `${site.value}[${site.guardSnippet}]` : site.value;

				return acc ? `${acc}|${siteValue}` : siteValue;
			}, '');

			const kind = candidate.signature.output.returnType;
			const allValues = candidate.signature.output.returnSites.map((site) => site.value);
			const duplicatedValues = allValues.filter((v, i) => allValues.indexOf(v) !== i);

			findings.push({
				ruleId: this.id,
				ruleIdentifier: { value, kind },
				message: `"${duplicatedValues.join(', ')}" value for the return type in function "${candidate.signature.name}" in file "${candidate.signature.file}" might be a sign of Connascence of Meaning. Reason: ${candidate.reason} (confidence: ${candidate.confidence})`,
				artifacts: candidate.signature.output.returnSites.map((site) => ({
					kind: 'com-semantic' as const,
					data: site,
				})),
			});
		}

		return findings;
	}

	public describeArtifact(artifact: Artifact): Record<string, string> {
		if (artifact.kind !== 'com-semantic') {
			return { value: String(artifact.data) };
		}
		const data = artifact.data as CoMCandidate['signature']['output']['returnSites'][number];
		const loc = `${data.location.file}:${data.location.line}${data.location.column !== undefined ? `:${data.location.column}` : ''}`;

		return {
			location: loc,
			value: data.value,
		};
	}
}

export default defineRule((options?: CoMSemanticRuleOptions) => new ConnascenceOfMeaningSemanticRule(options));
