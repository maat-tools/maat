import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Collector, FactRegistry, Finding, Rule } from '@maat/contracts';
import { Kernel } from './index';

// Extend FactRegistry for test purposes
declare module '@maat/contracts' {
	interface FactRegistry {
		testFact: string;
		otherFact: number;
		fileList: string[];
	}
}

// Helpers
function makeCollector(
	id: string,
	provides: (keyof FactRegistry)[],
	facts: Partial<FactRegistry>,
): Collector<keyof FactRegistry> {
	return {
		id,
		provideFacts: provides,
		collect: async () => facts as Pick<FactRegistry, keyof FactRegistry>,
	};
}

function makeRule(
	id: string,
	needs: (keyof FactRegistry)[],
	findings: Finding[],
): Rule {
	return {
		id,
		needFacts: needs,
		evaluate: () => findings,
	};
}

const sampleFinding: Finding = {
	ruleId: 'rule-a',
	message: 'Something is wrong',
	artifacts: [],
};

describe('Kernel.run()', () => {
	test('returns [] when no collectors and no rules are registered', async () => {
		const kernel = new Kernel();
		const { findings } = await kernel.run();
		expect(findings).toEqual([]);
	});

	test('returns [] when collectors are registered but no rules', async () => {
		const kernel = new Kernel();
		kernel.registerCollector(
			makeCollector('c1', ['testFact'], { testFact: 'hello' }),
		);
		const { findings } = await kernel.run();
		expect(findings).toEqual([]);
	});

	test('returns [] when rules are registered but collectors provide no matching facts', async () => {
		const kernel = new Kernel();
		kernel.registerRule(makeRule('r1', ['testFact'], [sampleFinding]));
		const { findings } = await kernel.run();
		expect(findings).toEqual([]);
	});

	test('calls all registered collectors and merges their facts', async () => {
		let c1Called = false;
		let c2Called = false;

		const c1: Collector<'testFact'> = {
			id: 'c1',
			provideFacts: ['testFact'],
			collect: async () => {
				c1Called = true;
				return { testFact: 'hello' };
			},
		};
		const c2: Collector<'otherFact'> = {
			id: 'c2',
			provideFacts: ['otherFact'],
			collect: async () => {
				c2Called = true;
				return { otherFact: 42 };
			},
		};

		const kernel = new Kernel();
		kernel.registerCollector(c1).registerCollector(c2);

		const rule: Rule<'testFact' | 'otherFact'> = {
			id: 'r1',
			needFacts: ['testFact', 'otherFact'],
			evaluate: (facts) => {
				expect(facts.testFact).toBe('hello');
				expect(facts.otherFact).toBe(42);
				return [];
			},
		};
		kernel.registerRule(rule);
		await kernel.run();

		expect(c1Called).toBe(true);
		expect(c2Called).toBe(true);
	});

	test('concatenates array facts from multiple collectors with the same key', async () => {
		const c1: Collector<'fileList'> = {
			id: 'c1',
			provideFacts: ['fileList'],
			collect: async () => ({ fileList: ['a.ts', 'b.ts'] }),
		};
		const c2: Collector<'fileList'> = {
			id: 'c2',
			provideFacts: ['fileList'],
			collect: async () => ({ fileList: ['A.cs', 'B.cs'] }),
		};

		const kernel = new Kernel();
		kernel.registerCollector(c1).registerCollector(c2);
		kernel.registerRule({
			id: 'r1',
			needFacts: ['fileList'],
			evaluate: (facts) => {
				expect(facts.fileList).toEqual(['a.ts', 'b.ts', 'A.cs', 'B.cs']);
				return [];
			},
		});
		await kernel.run();
	});

	test('skips a rule when its required facts are missing', async () => {
		const kernel = new Kernel();
		let evaluated = false;
		kernel.registerRule({
			id: 'r1',
			needFacts: ['testFact'],
			evaluate: () => {
				evaluated = true;
				return [];
			},
		});
		await kernel.run();
		expect(evaluated).toBe(false);
	});

	test('runs a rule and returns its findings when all required facts are present', async () => {
		const kernel = new Kernel();
		kernel.registerCollector(
			makeCollector('c1', ['testFact'], { testFact: 'hello' }),
		);
		kernel.registerRule(makeRule('r1', ['testFact'], [sampleFinding]));

		const { findings } = await kernel.run();
		expect(findings).toEqual([sampleFinding]);
	});

	test('a rule with an empty needs array always evaluates', async () => {
		const kernel = new Kernel();
		kernel.registerRule(makeRule('r-always', [], [sampleFinding]));

		const { findings } = await kernel.run();
		expect(findings).toEqual([sampleFinding]);
	});

	test('returns findings only from rules whose needs are satisfied', async () => {
		const satisfiedFinding: Finding = {
			ruleId: 'r-ok',
			message: 'ok',
			artifacts: [],
		};
		const kernel = new Kernel();
		kernel.registerCollector(
			makeCollector('c1', ['testFact'], { testFact: 'hello' }),
		);
		kernel.registerRule(makeRule('r-ok', ['testFact'], [satisfiedFinding]));
		kernel.registerRule(makeRule('r-skip', ['otherFact'], [sampleFinding]));

		const { findings } = await kernel.run();
		expect(findings).toEqual([satisfiedFinding]);
	});
});

describe('Kernel warnings', () => {
	let warnSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	test('warns when no collectors are registered', async () => {
		const kernel = new Kernel();
		await kernel.run();
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('No collectors registered'),
		);
	});

	test('warns when no rules are registered', async () => {
		const kernel = new Kernel();
		await kernel.run();
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('No rules registered'),
		);
	});

	test('warns when a rule is skipped due to missing facts', async () => {
		const kernel = new Kernel();
		kernel.registerCollector(
			makeCollector('c1', ['testFact'], { testFact: 'hello' }),
		);
		kernel.registerRule(makeRule('r-skip', ['otherFact'], [sampleFinding]));
		await kernel.run();
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('r-skip'));
	});
});

describe('Kernel fluent API', () => {
	test('registerCollector() returns this', () => {
		const kernel = new Kernel();
		const result = kernel.registerCollector(
			makeCollector('c1', ['testFact'], { testFact: 'x' }),
		);
		expect(result).toBe(kernel);
	});

	test('registerRule() returns this', () => {
		const kernel = new Kernel();
		const result = kernel.registerRule(makeRule('r1', [], []));
		expect(result).toBe(kernel);
	});
});

