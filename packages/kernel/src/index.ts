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
	enrich(facts?: Partial<FactRegistry>): Promise<Partial<FactRegistry>>;
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
		if (this.collectors.some((c) => c.id === collector.id)) {
			throw new Error(`Collector with id "${collector.id}" is already registered`);
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
		if (this.enrichers.some((e) => e.id === enricher.id)) {
			throw new Error(`Enricher with id "${enricher.id}" is already registered`);
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
		if (this.rules.some((r) => r.id === rule.id)) {
			throw new Error(`Rule with id "${rule.id}" is already registered`);
		}
		if (!Array.isArray(rule.needFacts)) {
			throw new Error(`Rule "${rule.id}" must have a needFacts array`);
		}
		if (rule.needFacts.length === 0) {
			throw new Error(`Rule "${rule.id}" must declare at least one fact in needFacts`);
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
		let facts: Partial<FactRegistry> = {};
		const factsRequiringVerification = new Map<string, string[]>();
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
			facts = this.mergeFacts(facts, collected);
		}

		const enricherResults = await Promise.all(
			this.enrichers.map(async (enricher, i) => {
				onProgress?.({ type: 'enricher:start', enricherId: enricher.id, index: i, total: this.enrichers.length });

				if (enricher.needFacts.length === 0) {
					const enriched = await enricher.enrich();
					factsRequiringVerification.set(enricher.id, enricher.provideFacts as string[]);

					onProgress?.({ type: 'enricher:done', enricherId: enricher.id, index: i, total: this.enrichers.length });

					return { enriched, enricher };
				}

				const hasFacts = enricher.needFacts.every((key) => key in facts);
				if (!hasFacts) {
					console.warn(`Enricher "${enricher.id}" skipped. Required facts are missing.`);
					onProgress?.({ type: 'enricher:done', enricherId: enricher.id, index: i, total: this.enrichers.length });

					return { enriched: {}, enricher };
				}

				const enriched = await enricher.enrich(Object.fromEntries(enricher.needFacts.map((key) => [key, facts[key]])));
				factsRequiringVerification.set(enricher.id, enricher.provideFacts as string[]);

				onProgress?.({ type: 'enricher:done', enricherId: enricher.id, index: i, total: this.enrichers.length });

				return { enriched, enricher };
			}),
		);

		for (const { enriched } of enricherResults) {
			facts = this.mergeFacts(facts, enriched);
		}

		const factsRequiringVerificationEntries = [...factsRequiringVerification.entries()];
		const findingsByRule = await Promise.all(
			this.rules.map(async (rule) => {
				const hasFacts = rule.needFacts.every((key) => key in facts);
				if (!hasFacts) {
					console.warn(`Rule "${rule.id}" skipped. Required facts are missing.`);

					return [];
				}

				const ruleResult = rule.evaluate(
					Object.fromEntries(rule.needFacts.map((key) => [key, facts[key]])) as unknown as FactRegistry,
				);

				const ruleNeedsVerification = rule.needFacts.flatMap((key) =>
					factsRequiringVerificationEntries
						.filter(([_, providedFacts]) => providedFacts.includes(key))
						.map(([enricherId]) => enricherId),
				);

				return ruleResult.map(({ ruleIdentifier, ...rest }) => {
					const finding: Finding = {
						...rest,
						fingerprint: generateFingerprint(rest.ruleId, ruleIdentifier),
						requiresVerification: ruleNeedsVerification.length > 0,
						artifacts:
							ruleNeedsVerification.length > 0
								? [
										...rest.artifacts,
										{
											kind: 'finding.provenance',
											data: {
												requiresVerification: true,
												verificationReason: `Facts provided by enrichers [${ruleNeedsVerification.join(', ')}]`,
											},
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

	private mergeFacts(target: Partial<FactRegistry>, source: Partial<FactRegistry>): Partial<FactRegistry> {
		const result = { ...target };

		for (const [key, value] of Object.entries(source)) {
			const existing = (result as Record<string, unknown>)[key];
			if (Array.isArray(existing) && Array.isArray(value)) {
				(result as Record<string, unknown>)[key] = [...existing, ...value];
			} else {
				(result as Record<string, unknown>)[key] = value;
			}
		}

		return result;
	}
}
