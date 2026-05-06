import type { Collector, FactRegistry, Finding, Rule } from '@maat/contracts';
import { stableHash } from '@maat/core';

function generateFingerprint(
	ruleId: string,
	ruleIdentifier: Record<string, unknown>,
): string {
	return stableHash({ ruleId, data: ruleIdentifier });
}

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
		if (!collector.id || collector.id.trim() === '') {
			throw new Error('Collector must have a non-empty id');
		}
		if (
			!Array.isArray(collector.provideFacts) ||
			collector.provideFacts.length === 0
		) {
			throw new Error(
				`Collector "${collector.id}" must declare at least one fact in provideFacts`,
			);
		}
		if (typeof collector.collect !== 'function') {
			throw new Error(`Collector "${collector.id}" must implement collect()`);
		}
		this.collectors.push(collector);

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
			const fromRule = rule.evaluate(facts as FactRegistry);
			for (const { ruleIdentifier, ...rest } of fromRule) {
				findings.push({
					...rest,
					fingerprint: generateFingerprint(rest.ruleId, ruleIdentifier),
				});
			}
		}

		return { findings };
	}
}
