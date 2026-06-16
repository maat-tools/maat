import { describe, expect, test } from 'bun:test';
import type { Collector, Rule } from '@maat-tools/contracts';
import { makeCollector, makeRule } from '@maat-tools/testing';
import { Kernel } from './index';

declare module '@maat-tools/contracts' {
	interface FactRegistry {
		scalarFact: string;
	}
}

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function timeout(ms: number): Promise<never> {
	return new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms));
}

describe('Kernel.run', () => {
	test('no collectors and no rules → empty findings', async () => {
		const { findings } = await new Kernel().run();
		expect(findings).toEqual([]);
	});

	test('collectors without rules → empty findings', async () => {
		const kernel = new Kernel().registerCollector(makeCollector(['x']));
		const { findings } = await kernel.run();
		expect(findings).toEqual([]);
	});

	test('rules without collectors → empty findings', async () => {
		const kernel = new Kernel().registerRule(makeRule());
		const { findings } = await kernel.run();
		expect(findings).toEqual([]);
	});

	test('collector provides facts and rule consumes them → findings produced', async () => {
		const kernel = new Kernel().registerCollector(makeCollector(['x'])).registerRule(makeRule());
		const { findings } = await kernel.run();
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('rule@v1');
	});

	test('rule needing a fact that was not collected → skipped, no findings', async () => {
		const kernel = new Kernel().registerRule(makeRule());
		const { findings } = await kernel.run();
		expect(findings).toEqual([]);
	});

	test('two collectors providing the same array fact key → arrays merged in registration order', async () => {
		const kernel = new Kernel()
			.registerCollector(makeCollector(['a'], 'collector-a'))
			.registerCollector(makeCollector(['b'], 'collector-b'))
			.registerRule(makeRule());
		const { findings } = await kernel.run();
		expect(findings).toHaveLength(2);
		expect(findings.map((f) => f.message)).toEqual(['finding: a', 'finding: b']);
	});

	test('non-array facts with the same key → last registered value wins', async () => {
		const firstCollector: Collector<'scalarFact'> = {
			id: 'first-collector',
			provideFacts: ['scalarFact'] as const,
			collect: async () => ({ scalarFact: 'first' }),
		};
		const secondCollector: Collector<'scalarFact'> = {
			id: 'second-collector',
			provideFacts: ['scalarFact'] as const,
			collect: async () => ({ scalarFact: 'second' }),
		};
		const rule: Rule<'scalarFact'> = {
			instanceId: 'scalar@v1',
			id: 'scalar@v1',
			needFacts: ['scalarFact'] as const,
			evaluate: ({ scalarFact }) => [
				{ ruleId: 'scalar@v1', ruleIdentifier: { value: scalarFact }, message: `value: ${scalarFact}`, artifacts: [] },
			],
			describeArtifact: (artifact) => ({ value: String(artifact.data) }),
		};

		const { findings } = await new Kernel()
			.registerCollector(firstCollector)
			.registerCollector(secondCollector)
			.registerRule(rule)
			.run();

		expect(findings[0]?.message).toBe('value: second');
	});

	test('rule receives only its declared facts', async () => {
		const seenKeys: string[][] = [];
		const otherCollector: Collector<'otherFacts'> = {
			id: 'other-collector',
			provideFacts: ['otherFacts'] as const,
			collect: async () => ({ otherFacts: ['hidden'] }),
		};
		const inspectingRule: Rule<'testFacts'> = {
			instanceId: 'inspecting-rule@v1',
			id: 'inspecting-rule@v1',
			needFacts: ['testFacts'] as const,
			evaluate: (facts) => {
				seenKeys.push(Object.keys(facts).sort());
				return [];
			},
			describeArtifact: (artifact) => ({ value: String(artifact.data) }),
		};

		await new Kernel()
			.registerCollector(makeCollector(['visible']))
			.registerCollector(otherCollector)
			.registerRule(inspectingRule)
			.run();

		expect(seenKeys).toEqual([['testFacts']]);
	});

	test('collectors run concurrently and merge facts in registration order', async () => {
		const firstCollectorCanFinish = deferred<void>();
		const secondCollectorStarted = deferred<void>();
		const firstCollector: Collector<'testFacts'> = {
			id: 'first-collector',
			provideFacts: ['testFacts'] as const,
			collect: async () => {
				await secondCollectorStarted.promise;
				await firstCollectorCanFinish.promise;
				return { testFacts: ['first'] };
			},
		};
		const secondCollector: Collector<'testFacts'> = {
			id: 'second-collector',
			provideFacts: ['testFacts'] as const,
			collect: async () => {
				secondCollectorStarted.resolve();
				firstCollectorCanFinish.resolve();
				return { testFacts: ['second'] };
			},
		};

		const kernel = new Kernel()
			.registerCollector(firstCollector)
			.registerCollector(secondCollector)
			.registerRule(makeRule());
		const { findings } = await Promise.race([kernel.run(), timeout(100)]);
		expect(findings.map((f) => f.message)).toEqual(['finding: first', 'finding: second']);
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

	test('different rule identifiers produce different fingerprints', async () => {
		const rule: Rule<'testFacts'> = {
			instanceId: 'dynamic@v1',
			id: 'dynamic@v1',
			needFacts: ['testFacts'] as const,
			evaluate: ({ testFacts }) =>
				testFacts.map((value, i) => ({
					ruleId: 'dynamic@v1',
					ruleIdentifier: { value, i },
					message: `finding: ${value}`,
					artifacts: [],
				})),
			describeArtifact: (artifact) => ({ value: String(artifact.data) }),
		};

		const { findings } = await new Kernel()
			.registerCollector(makeCollector(['a', 'b']))
			.registerRule(rule)
			.run();
		expect(findings).toHaveLength(2);
		expect(findings[0]?.fingerprint).not.toBe(findings[1]?.fingerprint);
	});

	test('finding.instanceId matches the rule instanceId', async () => {
		const kernel = new Kernel()
			.registerCollector(makeCollector(['x']))
			.registerRule(makeRule('rule@v1', 'my-custom-instance'));
		const { findings } = await kernel.run();
		expect(findings[0]?.instanceId).toBe('my-custom-instance');
	});

	test('two rules with the same id but different instanceIds produce findings with correct instanceIds', async () => {
		const kernel = new Kernel()
			.registerCollector(makeCollector(['x']))
			.registerRule(makeRule('rule@v1', 'instance-a'))
			.registerRule(makeRule('rule@v1', 'instance-b'));
		const { findings } = await kernel.run();
		const instanceIds = findings.map((f) => f.instanceId).sort();
		expect(instanceIds).toEqual(['instance-a', 'instance-b']);
	});

	test('artifacts emitted by a rule are preserved in findings', async () => {
		const artifact = { kind: 'test-artifact', data: { path: 'src/index.ts' } };
		const rule: Rule<'testFacts'> = {
			instanceId: 'artifact@v1',
			id: 'artifact@v1',
			needFacts: ['testFacts'] as const,
			evaluate: ({ testFacts }) =>
				testFacts.map((value, i) => ({
					ruleId: 'artifact@v1',
					ruleIdentifier: { value, i },
					message: `finding: ${value}`,
					artifacts: [artifact],
				})),
			describeArtifact: (a) => ({ value: String(a.data) }),
		};

		const { findings } = await new Kernel()
			.registerCollector(makeCollector(['x']))
			.registerRule(rule)
			.run();
		expect(findings[0]?.artifacts).toEqual([artifact]);
	});

	test('findings based only on collector facts do not require verification', async () => {
		const kernel = new Kernel().registerCollector(makeCollector(['x'])).registerRule(makeRule());
		const { findings } = await kernel.run();
		expect(findings[0]?.requiresVerification).toBe(false);
	});

	test('collector rejection causes run to reject', async () => {
		const collector: Collector<'testFacts'> = {
			id: 'failing-collector',
			provideFacts: ['testFacts'] as const,
			collect: async () => {
				throw new Error('collect failed');
			},
		};
		const kernel = new Kernel().registerCollector(collector).registerRule(makeRule());
		await expect(kernel.run()).rejects.toThrow('collect failed');
	});

	test('rule rejection causes run to reject', async () => {
		const rule: Rule<'testFacts'> = {
			instanceId: 'failing-rule@v1',
			id: 'failing-rule@v1',
			needFacts: ['testFacts'] as const,
			evaluate: () => {
				throw new Error('evaluate failed');
			},
			describeArtifact: (artifact) => ({ value: String(artifact.data) }),
		};
		const kernel = new Kernel().registerCollector(makeCollector(['x'])).registerRule(rule);
		await expect(kernel.run()).rejects.toThrow('evaluate failed');
	});
});
