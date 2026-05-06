import { describe, expect, test } from 'bun:test';
import type { Collector, Rule } from '@maat/contracts';
import { Kernel } from './index';

declare module '@maat/contracts' {
	interface FactRegistry {
		testFacts: string[];
	}
}

function makeCollector(items: string[]): Collector<'testFacts'> {
	return {
		id: 'test-collector',
		provideFacts: ['testFacts'] as const,
		collect: async () => ({ testFacts: items }),
	};
}

function makeRule(id = 'rule@v1'): Rule<'testFacts'> {
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
	};
}

describe('Kernel.run', () => {
	test('no collectors, no rules → empty findings', async () => {
		const { findings } = await new Kernel().run();
		expect(findings).toEqual([]);
	});

	test('collector provides facts, rule consumes them → findings produced', async () => {
		const kernel = new Kernel()
			.registerCollector(makeCollector(['x']))
			.registerRule(makeRule());

		const { findings } = await kernel.run();
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('rule@v1');
	});

	test('rule needs fact not collected → skipped, no findings', async () => {
		const kernel = new Kernel().registerRule(makeRule());
		const { findings } = await kernel.run();
		expect(findings).toEqual([]);
	});

	test('two collectors with same array fact key → arrays merged', async () => {
		const kernel = new Kernel()
			.registerCollector(makeCollector(['a']))
			.registerCollector(makeCollector(['b']))
			.registerRule(makeRule());

		const { findings } = await kernel.run();
		expect(findings).toHaveLength(2);
	});

	test('same input across two runs produces identical fingerprints', async () => {
		const build = () =>
			new Kernel()
				.registerCollector(makeCollector(['stable']))
				.registerRule(makeRule())
				.run();

		const [r1, r2] = await Promise.all([build(), build()]);
		expect(r1.findings.map((f) => f.fingerprint)).toEqual(r2.findings.map((f) => f.fingerprint));
	});
});

describe('Kernel fluent interface', () => {
	test('registerCollector returns this', () => {
		const kernel = new Kernel();
		expect(kernel.registerCollector(makeCollector([]))).toBe(kernel);
	});

	test('registerRule returns this', () => {
		const kernel = new Kernel();
		expect(kernel.registerRule(makeRule())).toBe(kernel);
	});
});
