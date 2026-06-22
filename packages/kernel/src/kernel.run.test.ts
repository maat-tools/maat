import { describe, expect, test } from 'bun:test';
import type { Artifact, Collector, Enricher, FactRegistry, Rule, RuleOutput } from '@maat-tools/contracts';
import { makeCollector, makeKernel, makeRule } from '@maat-tools/testing';
import { Kernel } from './index';

declare module '@maat-tools/contracts' {
	interface FactRegistry {
		scalarFact: string;
		requiredFactA: string[];
		requiredFactB: string[];
		unusedFact: string[];
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
			evaluate: ({ scalarFact }) => ({
				findings: [
					{
						ruleId: 'scalar@v1',
						ruleIdentifier: { value: scalarFact },
						message: `value: ${scalarFact}`,
						artifacts: [],
					},
				],
			}),
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
				return { findings: [] };
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
			evaluate: ({ testFacts }) => ({
				findings: testFacts.map((value, i) => ({
					ruleId: 'dynamic@v1',
					ruleIdentifier: { value, i },
					message: `finding: ${value}`,
					artifacts: [],
				})),
			}),
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

	test('two rule instances with different instanceIds but same ruleIdentifier fold into one finding', async () => {
		// Same ruleId + same ruleIdentifier → same fingerprint → consolidated by kernel.
		// In practice, two instances with the exact same check are redundant; the kernel
		// deduplicates them into a single canonical finding.
		const kernel = new Kernel()
			.registerCollector(makeCollector(['x']))
			.registerRule(makeRule('rule@v1', 'instance-a'))
			.registerRule(makeRule('rule@v1', 'instance-b'));
		const { findings } = await kernel.run();
		expect(findings).toHaveLength(1);
	});

	test('artifacts emitted by a rule are preserved in findings', async () => {
		const artifact = { kind: 'test-artifact', data: { path: 'src/index.ts' } };
		const rule: Rule<'testFacts'> = {
			instanceId: 'artifact@v1',
			id: 'artifact@v1',
			needFacts: ['testFacts'] as const,
			evaluate: ({ testFacts }) => ({
				findings: testFacts.map((value, i) => ({
					ruleId: 'artifact@v1',
					ruleIdentifier: { value, i },
					message: `finding: ${value}`,
					artifacts: [artifact],
				})),
			}),
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

describe('Kernel.run — finding identity consolidation', () => {
	function artifact(file: string): Artifact {
		return { kind: 'location', data: { file } };
	}

	function ruleOutput(ruleIdentifier: Record<string, unknown>, artifacts: Artifact[]): RuleOutput {
		return {
			ruleId: 'test@v1',
			ruleIdentifier,
			message: `violation ${JSON.stringify(ruleIdentifier)}`,
			artifacts,
		};
	}

	function files(finding: { artifacts: Artifact[] } | undefined): string[] {
		return (finding?.artifacts ?? []).map((a) => (a.data as { file: string }).file);
	}

	const SAME_ID = { pkg: '@scope/a', dep: 'mongodb' };

	test('folds findings that share a fingerprint into a single finding', async () => {
		const { findings } = await makeKernel([
			ruleOutput(SAME_ID, [artifact('a.ts')]),
			ruleOutput(SAME_ID, [artifact('b.ts')]),
			ruleOutput(SAME_ID, [artifact('c.ts')]),
		]).run();

		expect(findings).toHaveLength(1);
	});

	test('unions the artifacts of every site sharing a fingerprint (no evidence dropped)', async () => {
		const { findings } = await makeKernel([
			ruleOutput(SAME_ID, [artifact('a.ts')]),
			ruleOutput(SAME_ID, [artifact('b.ts')]),
			ruleOutput(SAME_ID, [artifact('c.ts')]),
		]).run();

		expect(files(findings[0])).toEqual(expect.arrayContaining(['a.ts', 'b.ts', 'c.ts']));
	});

	test('produces a deterministic artifact order regardless of input order', async () => {
		const forward = await makeKernel([
			ruleOutput(SAME_ID, [artifact('a.ts')]),
			ruleOutput(SAME_ID, [artifact('b.ts')]),
			ruleOutput(SAME_ID, [artifact('c.ts')]),
		]).run();

		const reversed = await makeKernel([
			ruleOutput(SAME_ID, [artifact('c.ts')]),
			ruleOutput(SAME_ID, [artifact('b.ts')]),
			ruleOutput(SAME_ID, [artifact('a.ts')]),
		]).run();

		expect(forward.findings).toHaveLength(1);
		expect(reversed.findings).toHaveLength(1);
		expect(files(forward.findings[0])).toEqual(files(reversed.findings[0]));
	});

	test('keeps findings with distinct fingerprints separate (no over-folding)', async () => {
		const { findings } = await makeKernel([
			ruleOutput({ pkg: '@scope/a', dep: 'mongodb' }, [artifact('a.ts')]),
			ruleOutput({ pkg: '@scope/a', dep: 'redis' }, [artifact('b.ts')]),
			ruleOutput({ pkg: '@scope/b', dep: 'mongodb' }, [artifact('c.ts')]),
		]).run();

		expect(findings).toHaveLength(3);
	});
});

describe('Kernel.run — smart collector fact selection', () => {
	function makeObservingCollector<TKeys extends keyof FactRegistry>(
		id: string,
		provideFacts: readonly TKeys[],
	): { collector: Collector<TKeys>; seenKeys: (keyof FactRegistry)[][] } {
		const seenKeys: (keyof FactRegistry)[][] = [];
		const collector: Collector<TKeys> = {
			id,
			provideFacts,
			collect: async (options) => {
				seenKeys.push([...(options?.requiredFactKeys ?? [])]);
				return Object.fromEntries(provideFacts.map((key) => [key, [`value-for-${String(key)}`]])) as Pick<
					FactRegistry,
					TKeys
				>;
			},
		};
		return { collector, seenKeys };
	}

	function makeRuleNeeding<TKeys extends keyof FactRegistry>(id: string, needFacts: readonly TKeys[]): Rule<TKeys> {
		return {
			instanceId: id,
			id,
			needFacts,
			evaluate: () => ({ findings: [] }),
			describeArtifact: (artifact) => ({ value: String(artifact.data) }),
		};
	}

	test('passes rule needFacts as requiredFactKeys to collectors', async () => {
		const { collector, seenKeys } = makeObservingCollector('observing', ['requiredFactA', 'requiredFactB']);
		await new Kernel()
			.registerCollector(collector)
			.registerRule(makeRuleNeeding('rule-a@v1', ['requiredFactA']))
			.run();

		expect(seenKeys).toHaveLength(1);
		expect(seenKeys[0]?.sort()).toEqual(['requiredFactA']);
	});

	test('passes union of all rule needFacts to collectors', async () => {
		const { collector, seenKeys } = makeObservingCollector('observing', ['requiredFactA', 'requiredFactB']);
		await new Kernel()
			.registerCollector(collector)
			.registerRule(makeRuleNeeding('rule-a@v1', ['requiredFactA']))
			.registerRule(makeRuleNeeding('rule-b@v1', ['requiredFactB']))
			.run();

		expect(seenKeys[0]?.sort()).toEqual(['requiredFactA', 'requiredFactB']);
	});

	test('passes enricher needFacts as requiredFactKeys to collectors', async () => {
		const { collector, seenKeys } = makeObservingCollector('observing', ['requiredFactA', 'testFacts']);
		const enricher: Enricher<'requiredFactA', 'enrichedFacts'> = {
			id: 'needs-a',
			needFacts: ['requiredFactA'] as const,
			provideFacts: ['enrichedFacts'] as const,
			enrich: async ({ requiredFactA }: { requiredFactA: string[] }) => ({
				facts: { enrichedFacts: requiredFactA.map((v) => `enriched:${v}`) },
			}),
		};

		await new Kernel().registerCollector(collector).registerEnricher(enricher).registerRule(makeRule()).run();

		expect(seenKeys[0]?.sort()).toEqual(['requiredFactA', 'testFacts']);
	});

	test('passes union of rule and enricher needFacts to collectors', async () => {
		const { collector, seenKeys } = makeObservingCollector('observing', ['requiredFactA', 'requiredFactB']);
		const enricher: Enricher<'requiredFactA', 'enrichedFacts'> = {
			id: 'needs-a',
			needFacts: ['requiredFactA'] as const,
			provideFacts: ['enrichedFacts'] as const,
			enrich: async ({ requiredFactA }: { requiredFactA: string[] }) => ({
				facts: { enrichedFacts: requiredFactA.map((v) => `enriched:${v}`) },
			}),
		};

		await new Kernel()
			.registerCollector(collector)
			.registerEnricher(enricher)
			.registerRule(makeRuleNeeding('rule-b@v1', ['requiredFactB']))
			.run();

		expect(seenKeys[0]?.sort()).toEqual(['requiredFactA', 'requiredFactB']);
	});

	test('requiredFactKeys contains rule needFacts regardless of which collector provides them', async () => {
		const { collector, seenKeys } = makeObservingCollector('observing', ['requiredFactA']);
		const rule: Rule<'testFacts'> = {
			instanceId: 'needs-test@v1',
			id: 'needs-test@v1',
			needFacts: ['testFacts'] as const,
			evaluate: () => ({ findings: [] }),
			describeArtifact: (artifact) => ({ value: String(artifact.data) }),
		};

		await new Kernel().registerCollector(collector).registerRule(rule).run();

		expect(seenKeys[0]).toEqual(['testFacts']);
	});

	test('every registered collector receives the same requiredFactKeys', async () => {
		const first = makeObservingCollector('first', ['requiredFactA']);
		const second = makeObservingCollector('second', ['requiredFactB']);

		await new Kernel()
			.registerCollector(first.collector)
			.registerCollector(second.collector)
			.registerRule(makeRuleNeeding('rule-a@v1', ['requiredFactA']))
			.run();

		expect(first.seenKeys[0]?.sort()).toEqual(['requiredFactA']);
		expect(second.seenKeys[0]?.sort()).toEqual(['requiredFactA']);
	});

	test('collector can return empty facts when none of its facts are required', async () => {
		const collector: Collector<'unusedFact'> = {
			id: 'smart-collector',
			provideFacts: ['unusedFact'] as const,
			collect: async ({ requiredFactKeys }: { requiredFactKeys?: Set<keyof FactRegistry> } = {}) => {
				if (requiredFactKeys?.has('unusedFact')) {
					return { unusedFact: ['collected'] };
				}
				return { unusedFact: [] };
			},
		};
		const rule: Rule<'testFacts'> = {
			instanceId: 'needs-test@v1',
			id: 'needs-test@v1',
			needFacts: ['testFacts'] as const,
			evaluate: () => ({ findings: [] }),
			describeArtifact: (artifact) => ({ value: String(artifact.data) }),
		};

		await new Kernel().registerCollector(collector).registerRule(rule).run();
		// Should complete without findings and without the collector throwing.
		expect(true).toBe(true);
	});

	test('progress events still fire when collector facts are not required', async () => {
		const collector: Collector<'unusedFact'> = {
			id: 'smart-collector',
			provideFacts: ['unusedFact'] as const,
			collect: async ({ requiredFactKeys }: { requiredFactKeys?: Set<keyof FactRegistry> } = {}) => ({
				unusedFact: requiredFactKeys?.has('unusedFact') ? ['collected'] : [],
			}),
		};
		const rule: Rule<'testFacts'> = {
			instanceId: 'needs-test@v1',
			id: 'needs-test@v1',
			needFacts: ['testFacts'] as const,
			evaluate: () => ({ findings: [] }),
			describeArtifact: (artifact) => ({ value: String(artifact.data) }),
		};
		const events: unknown[] = [];

		await new Kernel()
			.registerCollector(collector)
			.registerRule(rule)
			.run({ onProgress: (event) => events.push(event) });

		expect(events.some((e) => (e as { type: string }).type === 'collector:start')).toBe(true);
		expect(events.some((e) => (e as { type: string }).type === 'collector:done')).toBe(true);
	});

	test('collector only provides required facts and rule evaluation still works', async () => {
		const collector: Collector<'requiredFactA' | 'unusedFact'> = {
			id: 'smart-collector',
			provideFacts: ['requiredFactA', 'unusedFact'] as const,
			collect: async ({ requiredFactKeys }: { requiredFactKeys?: Set<keyof FactRegistry> } = {}) => ({
				requiredFactA: requiredFactKeys?.has('requiredFactA') ? ['a'] : [],
				unusedFact: requiredFactKeys?.has('unusedFact') ? ['should-not-appear'] : [],
			}),
		};
		const rule: Rule<'requiredFactA'> = {
			instanceId: 'needs-a@v1',
			id: 'needs-a@v1',
			needFacts: ['requiredFactA'] as const,
			evaluate: ({ requiredFactA }) => ({
				findings: requiredFactA.map((value) => ({
					ruleId: 'needs-a@v1',
					ruleIdentifier: { value },
					message: `found: ${value}`,
					artifacts: [],
				})),
			}),
			describeArtifact: (artifact) => ({ value: String(artifact.data) }),
		};

		const { findings } = await new Kernel().registerCollector(collector).registerRule(rule).run();

		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toBe('found: a');
	});
});
