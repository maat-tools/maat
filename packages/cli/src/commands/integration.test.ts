import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type FindingRuleOutput, FindingStatus } from '@maat/contracts';
import type { MaatConfig } from '@maat/core';
import { stableHash } from '@maat/core';
import { FilePathLedgerBackend } from '@maat/file-ledger';
import { Kernel } from '@maat/kernel';
import { Command } from 'commander';
import { Axiom } from './axiom';
import { Baseline } from './baseline';
import { Check } from './check';
import { Promote } from './promote';
import { Resolve } from './resolve';

// ── fixtures ────────────────────────────────────────────────────────────────

const BASE_CONFIG: MaatConfig = { collectors: [], rules: [] };
const STRICT_CONFIG: MaatConfig = {
	collectors: [],
	rules: [],
	check: { strict: true },
};

const RULE_OUTPUT: FindingRuleOutput = {
	ruleId: 'test@v1',
	ruleIdentifier: { id: 'magic-constant' },
	message: 'test finding',
	artifacts: [],
};

// Kernel computes fingerprint as stableHash({ ruleId, data: ruleIdentifier })
const FINGERPRINT = stableHash({
	ruleId: RULE_OUTPUT.ruleId,
	data: RULE_OUTPUT.ruleIdentifier,
});

// ── helpers ──────────────────────────────────────────────────────────────────

function makeKernel(findings: FindingRuleOutput[] = []) {
	const kernel = new Kernel();
	kernel.registerRule({
		id: 'test@v1',
		needFacts: [] as const,
		evaluate: () => findings,
		describeArtifact: (artifact) => ({ value: String(artifact.data) }),
	});
	return kernel;
}

function makeCheck(
	findings: FindingRuleOutput[],
	ledger: FilePathLedgerBackend | null,
	config: MaatConfig = BASE_CONFIG,
) {
	return new Check(new Command(), config, makeKernel(findings), ledger, []);
}

// ── setup ────────────────────────────────────────────────────────────────────

let dir: string;
let ledgerPath: string;
let exitSpy: ReturnType<typeof spyOn>;

beforeEach(async () => {
	dir = join(
		tmpdir(),
		`maat-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	await mkdir(dir, { recursive: true });
	ledgerPath = join(dir, 'test.ndjson');

	exitSpy = spyOn(process, 'exit').mockImplementation((() => {
		throw new Error('process.exit');
	}) as never);

	spyOn(console, 'log').mockImplementation(() => {});
	spyOn(console, 'error').mockImplementation(() => {});
	spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
	exitSpy.mockRestore();
	await rm(dir, { recursive: true, force: true });
});

// ── check (no ledger) ────────────────────────────────────────────────────────

describe('check without ledger', () => {
	test('findings present, non-strict → does not exit', async () => {
		await makeCheck([RULE_OUTPUT], null).action({});
		expect(exitSpy).not.toHaveBeenCalled();
	});

	test('findings present, strict → exit 1', async () => {
		await expect(
			makeCheck([RULE_OUTPUT], null, STRICT_CONFIG).action({}),
		).rejects.toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test('--show-baselined without ledger → exit 1', async () => {
		await expect(
			makeCheck([], null).action({ showBaselined: true }),
		).rejects.toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test('--ledger without ledger configured → exit 1', async () => {
		await expect(makeCheck([], null).action({ ledger: true })).rejects.toThrow(
			'process.exit',
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test('findings present → console.log is called', async () => {
		const logSpy = spyOn(console, 'log').mockImplementation(() => {});
		logSpy.mockClear();
		await makeCheck([RULE_OUTPUT], null).action({});
		expect(logSpy).toHaveBeenCalled();
	});

	test('--silent with findings → console.log is NOT called', async () => {
		const logSpy = spyOn(console, 'log').mockImplementation(() => {});
		logSpy.mockClear();
		await makeCheck([RULE_OUTPUT], null).action({ silent: true });
		expect(logSpy).not.toHaveBeenCalled();
	});

	test('--silent does not suppress exit code', async () => {
		await expect(
			makeCheck([RULE_OUTPUT], null, STRICT_CONFIG).action({ silent: true }),
		).rejects.toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});

// ── check (with ledger) ──────────────────────────────────────────────────────

describe('check with ledger', () => {
	test('findings present, strict → exit 1', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await expect(
			makeCheck([RULE_OUTPUT], ledger, STRICT_CONFIG).action({ ledger: true }),
		).rejects.toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test('no findings, strict → does not exit', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([], ledger, STRICT_CONFIG).action({ ledger: true });
		expect(exitSpy).not.toHaveBeenCalled();
	});

	test('--ledger writes OBSERVED events to ledger', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		const state = await ledger.getState();
		expect(state.findings[FINGERPRINT]?.state).toBe(FindingStatus.OBSERVED);
	});

	test('finding that disappeared is auto-resolved in ledger', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });
		await makeCheck([], ledger).action({ ledger: true });

		const state = await ledger.getState();
		expect(state.findings[FINGERPRINT]?.state).toBe(FindingStatus.RESOLVED);
	});

	test('finding RESOLVED that reappears → exit 1 (regression)', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true }); // observe
		await makeCheck([], ledger).action({ ledger: true }); // auto-resolve

		await expect(
			makeCheck([RULE_OUTPUT], ledger).action({ ledger: true }),
		).rejects.toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test('finding ENFORCED still present → exit 1', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		await new Promote(
			new Command(),
			BASE_CONFIG,
			makeKernel(),
			ledger,
			[],
		).action({ fingerprint: FINGERPRINT, enforce: true });

		await expect(
			makeCheck([RULE_OUTPUT], ledger).action({ ledger: true }),
		).rejects.toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test('finding PROMOTED still present → does not exit', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		await new Promote(
			new Command(),
			BASE_CONFIG,
			makeKernel(),
			ledger,
			[],
		).action({ fingerprint: FINGERPRINT });

		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });
		expect(exitSpy).not.toHaveBeenCalled();
	});

	test('finding BASELINED, non-strict → does not exit', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		await new Baseline(
			new Command(),
			BASE_CONFIG,
			makeKernel(),
			ledger,
			[],
		).action();

		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });
		expect(exitSpy).not.toHaveBeenCalled();
	});

	test('finding BASELINED + strict + --show-baselined → exit 1', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true }); // observe (non-strict)

		await new Baseline(
			new Command(),
			BASE_CONFIG,
			makeKernel(),
			ledger,
			[],
		).action();

		await expect(
			makeCheck([RULE_OUTPUT], ledger, STRICT_CONFIG).action({
				ledger: true,
				showBaselined: true,
			}),
		).rejects.toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test('finding BASELINED + strict, no --show-baselined → does not exit', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true }); // observe (non-strict)

		await new Baseline(
			new Command(),
			BASE_CONFIG,
			makeKernel(),
			ledger,
			[],
		).action();

		await makeCheck([RULE_OUTPUT], ledger, STRICT_CONFIG).action({
			ledger: true,
		});
		expect(exitSpy).not.toHaveBeenCalled();
	});

	test('findings present with ledger → console.log is called', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		const logSpy = spyOn(console, 'log').mockImplementation(() => {});
		logSpy.mockClear();
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });
		expect(logSpy).toHaveBeenCalled();
	});

	test('--silent with ledger → console.log and console.error are NOT called', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		const logSpy = spyOn(console, 'log').mockImplementation(() => {});
		const errSpy = spyOn(console, 'error').mockImplementation(() => {});
		logSpy.mockClear();
		errSpy.mockClear();
		await makeCheck([RULE_OUTPUT], ledger).action({
			ledger: true,
			silent: true,
		});
		expect(logSpy).not.toHaveBeenCalled();
		expect(errSpy).not.toHaveBeenCalled();
	});

	test('--silent with ledger still writes to ledger', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({
			ledger: true,
			silent: true,
		});
		const state = await ledger.getState();
		expect(state.findings[FINGERPRINT]?.state).toBe(FindingStatus.OBSERVED);
	});

	test('--silent with enforced finding → still exits 1', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });
		await new Promote(
			new Command(),
			BASE_CONFIG,
			makeKernel(),
			ledger,
			[],
		).action({
			fingerprint: FINGERPRINT,
			enforce: true,
		});
		await expect(
			makeCheck([RULE_OUTPUT], ledger).action({ ledger: true, silent: true }),
		).rejects.toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});

// ── baseline ─────────────────────────────────────────────────────────────────

describe('baseline', () => {
	test('baselines all un-baselined findings', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		await new Baseline(
			new Command(),
			BASE_CONFIG,
			makeKernel(),
			ledger,
			[],
		).action();

		const state = await ledger.getState();
		expect(state.findings[FINGERPRINT]?.baselined).toBe(true);
		expect(state.findings[FINGERPRINT]?.state).toBe(FindingStatus.OBSERVED);
	});
});

// ── promote ───────────────────────────────────────────────────────────────────

describe('promote', () => {
	test('promote → finding state becomes PROMOTED', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		await new Promote(
			new Command(),
			BASE_CONFIG,
			makeKernel(),
			ledger,
			[],
		).action({ fingerprint: FINGERPRINT });

		const state = await ledger.getState();
		expect(state.findings[FINGERPRINT]?.state).toBe(FindingStatus.PROMOTED);
	});

	test('promote --enforce → finding state becomes ENFORCED', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		await new Promote(
			new Command(),
			BASE_CONFIG,
			makeKernel(),
			ledger,
			[],
		).action({ fingerprint: FINGERPRINT, enforce: true });

		const state = await ledger.getState();
		expect(state.findings[FINGERPRINT]?.state).toBe(FindingStatus.ENFORCED);
	});
});

// ── axiom ─────────────────────────────────────────────────────────────────────

describe('axiom', () => {
	test('records axiom in ledger', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });

		await new Axiom(
			new Command(),
			BASE_CONFIG,
			makeKernel(),
			ledger,
			[],
		).action({
			id: 'no-side-effects',
			scope: 'auth',
			claim: 'auth module must have no side effects',
		});

		const state = await ledger.getState();
		expect(state.axioms['no-side-effects']?.claim).toBe(
			'auth module must have no side effects',
		);
	});
});

// ── resolve ───────────────────────────────────────────────────────────────────

describe('resolve', () => {
	test('resolve a PROMOTED finding → state becomes RESOLVED', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		await new Promote(
			new Command(),
			BASE_CONFIG,
			makeKernel(),
			ledger,
			[],
		).action({ fingerprint: FINGERPRINT });

		await new Resolve(
			new Command(),
			BASE_CONFIG,
			makeKernel(),
			ledger,
			[],
		).action({ fingerprint: FINGERPRINT });

		const state = await ledger.getState();
		expect(state.findings[FINGERPRINT]?.state).toBe(FindingStatus.RESOLVED);
	});
});
