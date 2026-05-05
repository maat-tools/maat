import { describe, expect, test } from 'bun:test';
import type {
	Collector,
	Finding,
	Insight,
	InsightResult,
	LedgerBackend,
	LedgerEventInput,
	Rule,
} from '@maat/contracts';
import { Kernel } from '@maat/kernel';
import { Command } from 'commander';
import { Check } from './check';

declare module '@maat/contracts' {
	interface FactRegistry {
		cliTestFact: string;
	}
}

const sampleFinding: Finding = {
	ruleId: 'rule-a',
	message: 'Something is wrong',
	artifacts: [],
};

function makeKernel(findings: Finding[]): Kernel {
	const collector: Collector<'cliTestFact'> = {
		id: 'cli-test-collector',
		provideFacts: ['cliTestFact'],
		collect: async () => ({ cliTestFact: 'ok' }),
	};
	const rule: Rule<'cliTestFact'> = {
		id: 'cli-test-rule',
		needFacts: ['cliTestFact'],
		evaluate: () => findings,
	};

	return new Kernel().registerCollector(collector).registerRule(rule);
}

function makeLedger(): {
	ledger: LedgerBackend;
	events: Extract<LedgerEventInput, { type: 'finding.observed' }>[];
} {
	const events: Extract<LedgerEventInput, { type: 'finding.observed' }>[] = [];
	return {
		events,
		ledger: {
			append: async (event) => {
				if (event.type !== 'finding.observed') {
					throw new Error('expected observed finding');
				}
				events.push(event);
			},
		},
	};
}

describe('Check command', () => {
	test('saves findings to the ledger by default', async () => {
		const { ledger, events } = makeLedger();
		const check = new Check(
			new Command(),
			makeKernel([sampleFinding]),
			ledger,
			[],
		);

		await check.action();

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			type: 'finding.observed',
			rule_id: sampleFinding.ruleId,
			message: sampleFinding.message,
		});
		expect(events[0]?.type).toBe('finding.observed');
		if (events[0]?.type !== 'finding.observed')
			throw new Error('expected observed finding');
		expect(events[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
	});

	test('generates a stable fingerprint for equivalent finding data', async () => {
		const { ledger, events } = makeLedger();
		const firstFinding: Finding = {
			ruleId: 'rule-a',
			message: 'Something is wrong',
			artifacts: [{ kind: 'source', data: { b: 2, a: { d: 4, c: 3 } } }],
		};
		const secondFinding: Finding = {
			message: 'Something is wrong',
			artifacts: [{ data: { a: { c: 3, d: 4 }, b: 2 }, kind: 'source' }],
			ruleId: 'rule-a',
		};

		await new Check(
			new Command(),
			makeKernel([firstFinding]),
			ledger,
			[],
		).action();
		await new Check(
			new Command(),
			makeKernel([secondFinding]),
			ledger,
			[],
		).action();

		expect(events).toHaveLength(2);
		expect(events[0]?.fingerprint).toBe(events[1]?.fingerprint);
	});

	test('does not save findings when ledger is disabled', async () => {
		const { ledger, events } = makeLedger();
		const check = new Check(
			new Command(),
			makeKernel([sampleFinding]),
			ledger,
			[],
		);

		await check.action({ ledger: false });

		expect(events).toHaveLength(0);
	});

	test('registers --no-ledger as an optional check flag', () => {
		const program = new Command();
		const check = new Check(program, makeKernel([]), null, []);

		check.register();

		const command = program.commands.find(
			(candidate) => candidate.name() === 'check',
		);
		expect(command?.helpInformation()).toContain('--no-ledger');
	});

	test('calls analyze() on each registered insight with the findings', async () => {
		const captured: Finding[][] = [];
		const insight: Insight = {
			id: 'spy-insight',
			needRules: [],
			analyze(findings) {
				captured.push(findings);
				return [];
			},
		};
		const check = new Check(new Command(), makeKernel([sampleFinding]), null, [
			insight,
		]);

		await check.action();

		expect(captured).toHaveLength(1);
		expect(captured[0]).toEqual([sampleFinding]);
	});

	test('insight results are not returned from action (side-effect only)', async () => {
		const result: InsightResult = {
			insightId: 'i1',
			message: 'ok',
			data: null,
		};
		const insight: Insight = {
			id: 'i1',
			needRules: [],
			analyze: () => [result],
		};
		const check = new Check(new Command(), makeKernel([sampleFinding]), null, [
			insight,
		]);

		const returned = await check.action();

		expect(returned).toBeUndefined();
	});
});
