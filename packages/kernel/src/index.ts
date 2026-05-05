import type {
	Collector,
	FactRegistry,
	Finding,
	Rule,
} from '@maat/contracts';

type StoredCollector = {
	readonly id: string;
	readonly provideFacts: readonly (keyof FactRegistry)[];
	collect(): Promise<Partial<FactRegistry>>;
};

export type KernelResult = {
	findings: Finding[];
};

export class Kernel {
	private collectors: StoredCollector[] = [];
	private rules: Rule[] = [];

	public registerCollector<TKeys extends keyof FactRegistry>(
		collector: Collector<TKeys>,
	): this {
		this.collectors.push(collector);
		return this;
	}

	public registerRule(rule: Rule): this {
		this.rules.push(rule);
		return this;
	}


	public async run(): Promise<KernelResult> {
		const facts: Partial<FactRegistry> = {};

		if (this.collectors.length === 0) {
			console.warn('No collectors registered. No facts will be collected.');
		}
		if (this.rules.length === 0) {
			console.warn('No rules registered. No findings will be produced.');
		}

		for (const collector of this.collectors) {
			const collected = await collector.collect();
			for (const [key, value] of Object.entries(collected)) {
				const existing = (facts as Record<string, unknown>)[key];
				if (Array.isArray(existing) && Array.isArray(value)) {
					(facts as Record<string, unknown>)[key] = [...existing, ...value];
				} else {
					(facts as Record<string, unknown>)[key] = value;
				}
			}
		}

		const findings: Finding[] = [];

		for (const rule of this.rules) {
			const hasFacts = rule.needFacts.every((key) => key in facts);
			if (!hasFacts) {
				console.warn(`Rule "${rule.id}" skipped. Required facts are missing.`);
				continue;
			}
			findings.push(...rule.evaluate(facts as FactRegistry));
		}

		return { findings };
	}
}
