import {
	type Collector,
	type Enricher,
	type FactRegistry,
	type Finding,
	generateFingerprint,
	type Rule,
} from '@maat-tools/contracts';

type StoredCollector = {
	readonly id: string;
	readonly provideFacts: readonly (keyof FactRegistry)[];
	collect(): Promise<Partial<FactRegistry>>;
};

type StoredEnricher = {
	readonly id: string;
	readonly needFacts: readonly (keyof FactRegistry)[];
	readonly provideFacts: readonly (keyof FactRegistry)[];
	enrich(facts: Partial<FactRegistry>): Promise<Partial<FactRegistry>>;
};

export type KernelResult = {
	findings: Finding[];
};

export type KernelProgressEvent =
	| { type: 'collector:start'; collectorId: string; index: number; total: number }
	| { type: 'collector:done'; collectorId: string; index: number; total: number }
	| { type: 'enricher:start'; enricherId: string; index: number; total: number }
	| { type: 'enricher:done'; enricherId: string; index: number; total: number };

export class Kernel {
	private collectors: StoredCollector[] = [];
	private enrichers: StoredEnricher[] = [];
	private rules: Rule[] = [];

	public registerCollector<TKeys extends keyof FactRegistry>(collector: Collector<TKeys>): this {
		if (!collector.id || collector.id.trim() === '') {
			throw new Error('Collector must have a non-empty id');
		}
		if (!Array.isArray(collector.provideFacts) || collector.provideFacts.length === 0) {
			throw new Error(`Collector "${collector.id}" must declare at least one fact in provideFacts`);
		}
		if (typeof collector.collect !== 'function') {
			throw new Error(`Collector "${collector.id}" must implement collect()`);
		}
		this.collectors.push(collector);

		return this;
	}

	public registerEnricher<TNeeds extends keyof FactRegistry, TProduces extends keyof FactRegistry>(
		enricher: Enricher<TNeeds, TProduces>,
	): this {
		if (!enricher.id || enricher.id.trim() === '') {
			throw new Error('Enricher must have a non-empty id');
		}
		if (!Array.isArray(enricher.needFacts)) {
			throw new Error(`Enricher "${enricher.id}" must have a needFacts array`);
		}
		if (!Array.isArray(enricher.provideFacts) || enricher.provideFacts.length === 0) {
			throw new Error(`Enricher "${enricher.id}" must declare at least one fact in provideFacts`);
		}
		if (typeof enricher.enrich !== 'function') {
			throw new Error(`Enricher "${enricher.id}" must implement enrich()`);
		}
		this.enrichers.push(enricher);

		return this;
	}

	public registerRule(rule: Rule): this {
		if (!rule.id || rule.id.trim() === '') {
			throw new Error('Rule must have a non-empty id');
		}
		if (!Array.isArray(rule.needFacts)) {
			throw new Error(`Rule "${rule.id}" must have a needFacts array`);
		}
		if (typeof rule.evaluate !== 'function') {
			throw new Error(`Rule "${rule.id}" must implement evaluate()`);
		}
		this.rules.push(rule);

		return this;
	}

	public getRuleById(id: string): Rule | undefined {
		return this.rules.find((r) => r.id === id);
	}

	public async run(options?: { onProgress?: (event: KernelProgressEvent) => void }): Promise<KernelResult> {
		const facts: Partial<FactRegistry> = {};
		const factsRequiringVerification = new Set<string>();
		const onProgress = options?.onProgress;

		if (this.collectors.length === 0) {
			console.warn('No collectors registered. No facts will be collected.');
		}
		if (this.rules.length === 0) {
			console.warn('No rules registered. No findings will be produced.');
		}

		const collectedResults = await Promise.all(
			this.collectors.map(async (collector, i) => {
				onProgress?.({ type: 'collector:start', collectorId: collector.id, index: i, total: this.collectors.length });
				const collected = await collector.collect();
				onProgress?.({ type: 'collector:done', collectorId: collector.id, index: i, total: this.collectors.length });

				return collected;
			}),
		);

		for (const collected of collectedResults) {
			for (const [key, value] of Object.entries(collected)) {
				const existing = (facts as Record<string, unknown>)[key];
				if (Array.isArray(existing) && Array.isArray(value)) {
					(facts as Record<string, unknown>)[key] = [...existing, ...value];
				} else {
					(facts as Record<string, unknown>)[key] = value;
				}
			}
		}

		const enricherResults = await Promise.all(
			this.enrichers.map(async (enricher, i) => {
				onProgress?.({ type: 'enricher:start', enricherId: enricher.id, index: i, total: this.enrichers.length });
				const hasFacts = enricher.needFacts.every((key) => Object.keys(facts).includes(key));
				if (!hasFacts) {
					console.warn(`Enricher "${enricher.id}" skipped. Required facts are missing.`);
					onProgress?.({ type: 'enricher:done', enricherId: enricher.id, index: i, total: this.enrichers.length });
					return null;
				}
				const enriched = await enricher.enrich(facts);
				onProgress?.({ type: 'enricher:done', enricherId: enricher.id, index: i, total: this.enrichers.length });
				return { enriched, enricher };
			}),
		);

		for (const result of enricherResults) {
			if (!result) {
				continue;
			}
			const { enriched, enricher } = result;
			for (const [key, value] of Object.entries(enriched)) {
				const existing = (facts as Record<string, unknown>)[key];
				if (Array.isArray(existing) && Array.isArray(value)) {
					(facts as Record<string, unknown>)[key] = [...existing, ...value];
				} else {
					(facts as Record<string, unknown>)[key] = value;
				}
			}
			for (const factKey of enricher.provideFacts) {
				factsRequiringVerification.add(factKey);
			}
		}

		const factsKeys = Object.keys(facts);
		const findingsByRule = await Promise.all(
			this.rules.map(async (rule) => {
				const hasFacts = rule.needFacts.every((key) => factsKeys.includes(key));
				if (!hasFacts) {
					console.warn(`Rule "${rule.id}" skipped. Required facts are missing.`);
					return [];
				}

				const ruleFacts = Object.fromEntries(rule.needFacts.map((key) => [key, facts[key]]));
				if (!ruleFacts) {
					console.warn(`Rule "${rule.id}" skipped. Required facts are missing.`);
					return [];
				}
				const fromRule = rule.evaluate(ruleFacts as unknown as FactRegistry);

				const ruleNeedsVerification = rule.needFacts.some((key) => factsRequiringVerification.has(key));

				return fromRule.map(({ ruleIdentifier, ...rest }) => {
					const finding: Finding = {
						...rest,
						fingerprint: generateFingerprint(rest.ruleId, ruleIdentifier),
						requiresVerification: ruleNeedsVerification,
						artifacts: ruleNeedsVerification
							? [
									...rest.artifacts,
									{
										kind: 'finding.provenance',
										data: { requiresVerification: true, sources: Array.from(factsRequiringVerification) },
									},
								]
							: rest.artifacts,
					};
					return finding;
				});
			}),
		);

		return { findings: findingsByRule.flat() };
	}
}
