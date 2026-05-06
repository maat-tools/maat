import { describe, expect, spyOn, test } from 'bun:test';
import type {
	Collector,
	Finding,
	FindingRecord,
	Insight,
	InsightResult,
	LedgerBackend,
	LedgerEventInput,
	LedgerSnapshot,
	Rule,
} from '@maat/contracts';
import { FindingStatus } from '@maat/contracts';
import type { MaatConfig } from '@maat/core';
import { Kernel } from '@maat/kernel';
import { Command } from 'commander';
import { Check } from './check';

declare module '@maat/contracts' {
	interface FactRegistry {
		cliTestFact: string;
	}
}

const minimalConfig: MaatConfig = { collectors: [], rules: [] };

const sampleFinding: Finding = {
	ruleId: 'rule-a',
	fingerprint: '',
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
		evaluate: () => findings as unknown as ReturnType<Rule['evaluate']>,
	};

	return new Kernel().registerCollector(collector).registerRule(rule);
}

function makeEmptySnapshot(): LedgerSnapshot {
	return { last_entry_id: null, findings: {}, axioms: {} };
}

function makeLedger(initialSnapshot: LedgerSnapshot = makeEmptySnapshot()): {
	ledger: LedgerBackend;
	events: LedgerEventInput[];
} {
	const events: LedgerEventInput[] = [];
	const ledger: LedgerBackend = {
		append: async (event) => { events.push(event); },
		getState: async () => initialSnapshot,
		buildEntry: () => { throw new Error('buildEntry should not be called from check'); },
	};
	return { events, ledger };
}

function makeSnapshotWithFinding(fingerprint: string, state: FindingRecord['state'], baselined = false): LedgerSnapshot {
	return {
		last_entry_id: null,
		findings: {
			[fingerprint]: {
				fingerprint,
				state,
				baselined,
				rule_id: 'rule-a',
				message: 'Something is wrong',
				artifacts: [],
			},
		},
		axioms: {},
	};
}

describe('Check command', () => {
	test('saves findings to the ledger when --ledger is passed', async () => {
		const { ledger, events } = makeLedger();
		const check = new Check(
			new Command(),
			minimalConfig,
			makeKernel([sampleFinding]),
			ledger,
			[],
		);

		await check.action({ ledger: true });

		const observed = events.filter((e) => e.type === 'finding.observed');
		expect(observed).toHaveLength(1);
		expect(observed[0]).toMatchObject({
			type: 'finding.observed',
			rule_id: sampleFinding.ruleId,
			message: sampleFinding.message,
		});
		const first = observed[0];
		if (first?.type !== 'finding.observed') throw new Error('unexpected type');
		expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
	});

	test('generates a stable fingerprint for equivalent finding data', async () => {
		const { ledger, events } = makeLedger();
		const firstFinding: Finding = {
			ruleId: 'rule-a',
			fingerprint: '',
			message: 'Something is wrong',
			artifacts: [{ kind: 'source', data: { b: 2, a: { d: 4, c: 3 } } }],
		};
		const secondFinding: Finding = {
			message: 'Something is wrong',
			fingerprint: '',
			artifacts: [{ data: { a: { c: 3, d: 4 }, b: 2 }, kind: 'source' }],
			ruleId: 'rule-a',
		};

		await new Check(new Command(), minimalConfig, makeKernel([firstFinding]), ledger, []).action({ ledger: true });
		await new Check(new Command(), minimalConfig, makeKernel([secondFinding]), ledger, []).action({ ledger: true });

		const observed = events.filter((e) => e.type === 'finding.observed');
		expect(observed).toHaveLength(2);
		const [a, b] = observed;
		if (a?.type !== 'finding.observed' || b?.type !== 'finding.observed') throw new Error('unexpected type');
		expect(a.fingerprint).toBe(b.fingerprint);
	});

	test('does not save findings by default (no --ledger flag)', async () => {
		const { ledger, events } = makeLedger();
		const check = new Check(
			new Command(),
			minimalConfig,
			makeKernel([sampleFinding]),
			ledger,
			[],
		);

		await check.action();

		expect(events).toHaveLength(0);
	});

	test('registers --ledger as an optional check flag', () => {
		const program = new Command();
		const check = new Check(program, minimalConfig, makeKernel([]), null, []);

		check.register();

		const command = program.commands.find(
			(candidate) => candidate.name() === 'check',
		);
		expect(command?.helpInformation()).toContain('--ledger');
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
		const check = new Check(new Command(), minimalConfig, makeKernel([sampleFinding]), null, [
			insight,
		]);

		await check.action();

		expect(captured).toHaveLength(1);
		expect(captured[0]).toHaveLength(1);
		expect(captured[0]?.[0]).toMatchObject({
			ruleId: sampleFinding.ruleId,
			message: sampleFinding.message,
			artifacts: sampleFinding.artifacts,
		});
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
		const check = new Check(new Command(), minimalConfig, makeKernel([sampleFinding]), null, [
			insight,
		]);

		const returned = await check.action();

		expect(returned).toBeUndefined();
	});

	test('writes finding.resolved for an observed active finding that disappeared', async () => {
		// Probe run: get the fingerprint the kernel assigns to sampleFinding
		const { ledger: probeLedger, events: probeEvents } = makeLedger();
		await new Check(new Command(), minimalConfig, makeKernel([sampleFinding]), probeLedger, []).action({ ledger: true });
		const probeEvent = probeEvents.find((e) => e.type === 'finding.observed');
		if (probeEvent?.type !== 'finding.observed') throw new Error('no observed event');
		const fingerprint = probeEvent.fingerprint;

		// Now run with sampleFinding in snapshot as 'observed' but kernel emits nothing
		const snapshot = makeSnapshotWithFinding(fingerprint, FindingStatus.OBSERVED);
		const { ledger, events } = makeLedger(snapshot);
		await new Check(new Command(), minimalConfig, makeKernel([]), ledger, []).action({ ledger: true });

		expect(events.some((e) => e.type === 'finding.resolved' && e.fingerprint === fingerprint)).toBe(true);
	});

	test('warns and exits 1 for a promoted finding that disappeared (pending resolution)', async () => {
		const exitSpy = spyOn(process, 'exit').mockImplementation((() => {}) as never);
		const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const { ledger: probeLedger, events: probeEvents } = makeLedger();
			await new Check(new Command(), minimalConfig, makeKernel([sampleFinding]), probeLedger, []).action({ ledger: true });
			const probeEvent = probeEvents.find((e) => e.type === 'finding.observed');
			if (probeEvent?.type !== 'finding.observed') throw new Error('no observed event');
			const fingerprint = probeEvent.fingerprint;

			const snapshot = makeSnapshotWithFinding(fingerprint, FindingStatus.PROMOTED);
			const { ledger, events } = makeLedger(snapshot);
			await new Check(new Command(), minimalConfig, makeKernel([]), ledger, []).action({ ledger: true });

			expect(events.some((e) => e.type === 'finding.resolved')).toBe(false);
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('maat resolve'));
			expect(exitSpy).toHaveBeenCalledWith(1);
		} finally {
			exitSpy.mockRestore();
			warnSpy.mockRestore();
		}
	});

	test('does not write finding.resolved for a baselined finding that disappeared', async () => {
		const { ledger: probeLedger, events: probeEvents } = makeLedger();
		await new Check(new Command(), minimalConfig, makeKernel([sampleFinding]), probeLedger, []).action({ ledger: true });
		const probeEvent = probeEvents.find((e) => e.type === 'finding.observed');
		if (probeEvent?.type !== 'finding.observed') throw new Error('no observed event');
		const fingerprint = probeEvent.fingerprint;

		const snapshot = makeSnapshotWithFinding(fingerprint, FindingStatus.OBSERVED, true);
		const { ledger, events } = makeLedger(snapshot);
		await new Check(new Command(), minimalConfig, makeKernel([]), ledger, []).action({ ledger: true });

		expect(events.some((e) => e.type === 'finding.resolved')).toBe(false);
	});

	test('writes finding.observed when a resolved finding reappears (regression)', async () => {
		const exitSpy = spyOn(process, 'exit').mockImplementation((() => {}) as never);
		try {
			const { ledger: probeLedger, events: probeEvents } = makeLedger();
			await new Check(new Command(), minimalConfig, makeKernel([sampleFinding]), probeLedger, []).action({ ledger: true });
			const probeEvent = probeEvents.find((e) => e.type === 'finding.observed');
			if (probeEvent?.type !== 'finding.observed') throw new Error('no observed event');
			const fingerprint = probeEvent.fingerprint;

			const snapshot = makeSnapshotWithFinding(fingerprint, FindingStatus.RESOLVED);
			const { ledger, events } = makeLedger(snapshot);
			await new Check(new Command(), minimalConfig, makeKernel([sampleFinding]), ledger, []).action({ ledger: true });

			const reobserved = events.find((e) => e.type === 'finding.observed' && e.fingerprint === fingerprint);
			expect(reobserved).toBeDefined();
			expect(events.some((e) => e.type === 'finding.resolved')).toBe(false);
			expect(exitSpy).toHaveBeenCalledWith(1);
		} finally {
			exitSpy.mockRestore();
		}
	});

	test('exits 1 when a promoted finding disappears on subsequent runs (pending resolution)', async () => {
		const exitSpy = spyOn(process, 'exit').mockImplementation((() => {}) as never);
		const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const { ledger: probeLedger, events: probeEvents } = makeLedger();
			await new Check(new Command(), minimalConfig, makeKernel([sampleFinding]), probeLedger, []).action({ ledger: true });
			const probeEvent = probeEvents.find((e) => e.type === 'finding.observed');
			if (probeEvent?.type !== 'finding.observed') throw new Error('no observed event');
			const fingerprint = probeEvent.fingerprint;

			// Snapshot has promoted finding, but current run emits nothing — pending resolution
			const snapshot = makeSnapshotWithFinding(fingerprint, FindingStatus.PROMOTED);
			const { ledger } = makeLedger(snapshot);
			await new Check(new Command(), minimalConfig, makeKernel([]), ledger, []).action({ ledger: true });

			expect(exitSpy).toHaveBeenCalledWith(1);
		} finally {
			exitSpy.mockRestore();
			warnSpy.mockRestore();
		}
	});
});

