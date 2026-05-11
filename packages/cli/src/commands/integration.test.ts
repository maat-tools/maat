import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	type Finding,
	type FindingRuleOutput,
	FindingStatus,
	generateFingerprint,
	type Insight,
} from '@maat-tools/contracts';
import type { MaatConfig } from '@maat-tools/core';
import { FilePathLedgerBackend } from '@maat-tools/file-ledger';
import { Kernel } from '@maat-tools/kernel';
import { Command } from 'commander';
import { Printer } from '../printer';
import { Axiom } from './axiom';
import { Baseline } from './baseline';
import { Check } from './check';
import { Resolve } from './resolve';
import { Visualize } from './visualize';

// ── fixtures ────────────────────────────────────────────────────────────────

const TEST_PRINTER = new Printer({ silent: true });

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

const FINGERPRINT = generateFingerprint(RULE_OUTPUT.ruleId, RULE_OUTPUT.ruleIdentifier);

const NEW_RULE_OUTPUT: FindingRuleOutput = {
	ruleId: 'test@v1',
	ruleIdentifier: { id: 'new-feature' },
	message: 'new feature finding',
	artifacts: [],
};

const NEW_FINGERPRINT = generateFingerprint(NEW_RULE_OUTPUT.ruleId, NEW_RULE_OUTPUT.ruleIdentifier);

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
	silent = true,
	insights: Insight[] = [],
) {
	return new Check(new Command(), config, makeKernel(findings), insights, new Printer({ silent }), ledger);
}

function makeVisualize(ledger: FilePathLedgerBackend | null, insights: Insight[] = [], silent = true) {
	return new Visualize(new Command(), BASE_CONFIG, makeKernel(), insights, new Printer({ silent }), ledger);
}

// ── setup ────────────────────────────────────────────────────────────────────

let dir: string;
let ledgerPath: string;
let exitSpy: ReturnType<typeof spyOn>;

beforeEach(async () => {
	dir = join(tmpdir(), `maat-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
	test('prints what rules and insights run on', async () => {
		const logSpy = spyOn(console, 'log').mockImplementation(() => {});
		logSpy.mockClear();

		await makeCheck([], null, BASE_CONFIG, false).action({});

		const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
		expect(output).toContain('RUN CONTEXT');
		expect(output).toContain('Rules run on current workspace facts collected during this check.');
		expect(output).toContain('Ledger: not configured; no baseline, axiom, or regression filtering is applied.');
		expect(output).toContain(
			'Insights run on all current findings from this run, including findings hidden by baselines or active axiom exceptions.',
		);
	});

	test('findings present, non-strict → does not exit', async () => {
		await makeCheck([RULE_OUTPUT], null).action({});
		expect(exitSpy).not.toHaveBeenCalled();
	});

	test('findings present, strict → exit 1', async () => {
		await expect(makeCheck([RULE_OUTPUT], null, STRICT_CONFIG).action({})).rejects.toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test('--show-baselined without ledger → exit 1', async () => {
		await expect(makeCheck([], null).action({ showBaselined: true })).rejects.toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test('--ledger without ledger configured → exit 1', async () => {
		await expect(makeCheck([], null).action({ ledger: true })).rejects.toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test('findings present → console.log is called', async () => {
		const logSpy = spyOn(console, 'log').mockImplementation(() => {});
		logSpy.mockClear();
		await makeCheck([RULE_OUTPUT], null, BASE_CONFIG, false).action({});
		expect(logSpy).toHaveBeenCalled();
	});

	test('--silent with findings → console.log is NOT called', async () => {
		const logSpy = spyOn(console, 'log').mockImplementation(() => {});
		logSpy.mockClear();
		await makeCheck([RULE_OUTPUT], null).action({ silent: true });
		expect(logSpy).not.toHaveBeenCalled();
	});

	test('--silent does not suppress exit code', async () => {
		await expect(makeCheck([RULE_OUTPUT], null, STRICT_CONFIG).action({ silent: true })).rejects.toThrow(
			'process.exit',
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});

// ── check (with ledger) ──────────────────────────────────────────────────────

describe('check with ledger', () => {
	test('prints read-only ledger run context without --ledger', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		const logSpy = spyOn(console, 'log').mockImplementation(() => {});
		logSpy.mockClear();

		await makeCheck([], ledger, BASE_CONFIG, false).action({});

		const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
		expect(output).toContain('Ledger: configured; this run reads state only.');
		expect(output).toContain(
			'Findings shown: active current findings; non-expired baselines and active axiom exceptions are hidden.',
		);
		expect(output).toContain(
			'Insights run on all current findings from this run, including findings hidden by baselines or active axiom exceptions.',
		);
	});

	test('prints ledger-writing run context with --ledger', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		const logSpy = spyOn(console, 'log').mockImplementation(() => {});
		logSpy.mockClear();

		await makeCheck([], ledger, BASE_CONFIG, false).action({ ledger: true });

		const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
		expect(output).toContain('Ledger: configured; this run reads state and writes observed/resolved events.');
	});

	test('insights analyze baselined current findings hidden from output', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });
		await new Baseline(new Command(), BASE_CONFIG, makeKernel(), [], TEST_PRINTER, ledger).action();

		const analyzed: Finding[][] = [];
		const insight: Insight = {
			id: 'test-insight',
			needRules: ['test@v1'],
			analyze: (findings) => {
				analyzed.push(findings);
				return [];
			},
		};

		await makeCheck([RULE_OUTPUT], ledger, BASE_CONFIG, true, [insight]).action({});

		expect(analyzed).toHaveLength(1);
		expect(analyzed[0]?.map((finding) => finding.fingerprint)).toContain(FINGERPRINT);
		expect(exitSpy).not.toHaveBeenCalled();
	});

	test('warns when insights run', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
		warnSpy.mockClear();
		const insight: Insight = {
			id: 'test-insight',
			needRules: ['test@v1'],
			analyze: () => [],
		};

		await makeCheck([], ledger, BASE_CONFIG, false, [insight]).action({});

		const output = warnSpy.mock.calls.map(([line]) => String(line)).join('\n');
		expect(output).toContain(
			'Insights analyze all current findings from this run, including findings hidden by baselines or active axiom exceptions.',
		);
	});

	test('findings present, strict → exit 1', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await expect(makeCheck([RULE_OUTPUT], ledger, STRICT_CONFIG).action({ ledger: true })).rejects.toThrow(
			'process.exit',
		);
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

	test('--ledger is idempotent for unchanged observed findings', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		const lines = (await readFile(ledgerPath, 'utf-8')).trim().split('\n');
		expect(lines).toHaveLength(1);
	});

	test('--ledger does not duplicate baselined findings when new findings appear', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });
		await new Baseline(new Command(), BASE_CONFIG, makeKernel(), [], TEST_PRINTER, ledger).action();

		await makeCheck([RULE_OUTPUT, NEW_RULE_OUTPUT], ledger).action({ ledger: true });

		const events = (await readFile(ledgerPath, 'utf-8'))
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line) as { type: string; fingerprint: string });
		expect(events).toHaveLength(3);
		expect(
			events.filter((event) => event.type === FindingStatus.OBSERVED && event.fingerprint === FINGERPRINT),
		).toHaveLength(1);
		expect(
			events.filter((event) => event.type === FindingStatus.OBSERVED && event.fingerprint === NEW_FINGERPRINT),
		).toHaveLength(1);
		expect(
			events.filter((event) => event.type === FindingStatus.BASELINED && event.fingerprint === FINGERPRINT),
		).toHaveLength(1);
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

		await expect(makeCheck([RULE_OUTPUT], ledger).action({ ledger: true })).rejects.toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test('resolved regression stays resolved after check --ledger', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true }); // observe
		await makeCheck([], ledger).action({ ledger: true }); // auto-resolve

		await expect(makeCheck([RULE_OUTPUT], ledger).action({ ledger: true })).rejects.toThrow('process.exit');

		const state = await ledger.getState();
		expect(state.findings[FINGERPRINT]?.state).toBe(FindingStatus.RESOLVED);
	});

	test('finding BASELINED, non-strict → does not exit', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		await new Baseline(new Command(), BASE_CONFIG, makeKernel(), [], TEST_PRINTER, ledger).action();

		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });
		expect(exitSpy).not.toHaveBeenCalled();
	});

	test('finding BASELINED + strict + --show-baselined → exit 1', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true }); // observe (non-strict)

		await new Baseline(new Command(), BASE_CONFIG, makeKernel(), [], TEST_PRINTER, ledger).action();

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

		await new Baseline(new Command(), BASE_CONFIG, makeKernel(), [], TEST_PRINTER, ledger).action();

		await makeCheck([RULE_OUTPUT], ledger, STRICT_CONFIG).action({
			ledger: true,
		});
		expect(exitSpy).not.toHaveBeenCalled();
	});

	test('expired baseline → exit 1', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		// Baseline with an already-expired date
		const pastDate = new Date(Date.now() - 1000).toISOString();
		await ledger.append({
			type: FindingStatus.BASELINED,
			timestamp: new Date().toISOString(),
			fingerprint: FINGERPRINT,
			expires_at: pastDate,
		});

		await expect(makeCheck([RULE_OUTPUT], ledger).action({ ledger: true })).rejects.toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test('findings present with ledger → console.log is called', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		const logSpy = spyOn(console, 'log').mockImplementation(() => {});
		logSpy.mockClear();
		await makeCheck([RULE_OUTPUT], ledger, BASE_CONFIG, false).action({ ledger: true });
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
});

// ── baseline ─────────────────────────────────────────────────────────────────

describe('baseline', () => {
	test('baselines all un-baselined findings', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		await new Baseline(new Command(), BASE_CONFIG, makeKernel(), [], TEST_PRINTER, ledger).action();

		const state = await ledger.getState();
		expect(state.findings[FINGERPRINT]?.baselined).toBe(true);
		expect(state.findings[FINGERPRINT]?.state).toBe(FindingStatus.OBSERVED);
	});

	test('baseline stores expires_at ~30 days from now by default', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		const before = Date.now();
		await new Baseline(new Command(), BASE_CONFIG, makeKernel(), [], TEST_PRINTER, ledger).action();
		const after = Date.now();

		const state = await ledger.getState();
		const expiresAt = state.findings[FINGERPRINT]?.baseline_expires_at;
		expect(expiresAt).toBeDefined();
		const expiresMs = new Date(expiresAt as string).getTime();
		const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
		expect(expiresMs).toBeGreaterThanOrEqual(before + thirtyDaysMs);
		expect(expiresMs).toBeLessThanOrEqual(after + thirtyDaysMs);
	});

	test('--expires-in with valid custom value stores correct expires_at', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		const before = Date.now();
		await new Baseline(new Command(), BASE_CONFIG, makeKernel(), [], TEST_PRINTER, ledger).action({ expiresIn: '30' });
		const after = Date.now();

		const state = await ledger.getState();
		const expiresAt = state.findings[FINGERPRINT]?.baseline_expires_at;
		expect(expiresAt).toBeDefined();
		const expiresMs = new Date(expiresAt as string).getTime();
		const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
		expect(expiresMs).toBeGreaterThanOrEqual(before + thirtyDaysMs);
		expect(expiresMs).toBeLessThanOrEqual(after + thirtyDaysMs);
	});

	test('--expires-in 1 (minimum) → stores correct expires_at', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		const before = Date.now();
		await new Baseline(new Command(), BASE_CONFIG, makeKernel(), [], TEST_PRINTER, ledger).action({ expiresIn: '1' });
		const after = Date.now();

		const state = await ledger.getState();
		const expiresAt = state.findings[FINGERPRINT]?.baseline_expires_at;
		expect(expiresAt).toBeDefined();
		const expiresMs = new Date(expiresAt as string).getTime();
		const oneDayMs = 1 * 24 * 60 * 60 * 1000;
		expect(expiresMs).toBeGreaterThanOrEqual(before + oneDayMs);
		expect(expiresMs).toBeLessThanOrEqual(after + oneDayMs);
	});

	test('--expires-in 0 → exits 1', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		await expect(
			new Baseline(new Command(), BASE_CONFIG, makeKernel(), [], TEST_PRINTER, ledger).action({ expiresIn: '0' }),
		).rejects.toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test('--expires-in above maximum → exits 1', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		await expect(
			new Baseline(new Command(), BASE_CONFIG, makeKernel(), [], TEST_PRINTER, ledger).action({ expiresIn: '91' }),
		).rejects.toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	test('nothing to baseline → does not exit', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		// no findings observed — ledger is empty
		await new Baseline(new Command(), BASE_CONFIG, makeKernel(), [], TEST_PRINTER, ledger).action();
		expect(exitSpy).not.toHaveBeenCalled();
	});
});

// ── axiom ─────────────────────────────────────────────────────────────────────

describe('axiom', () => {
	test('records axiom in ledger', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });

		await new Axiom(new Command(), BASE_CONFIG, makeKernel(), [], TEST_PRINTER, ledger).action({
			id: 'no-side-effects',
			scope: 'auth',
			claim: 'auth module must have no side effects',
		});

		const state = await ledger.getState();
		expect(state.axioms['no-side-effects']?.claim).toBe('auth module must have no side effects');
	});
});

// ── resolve ───────────────────────────────────────────────────────────────────

describe('resolve', () => {
	test('resolve an observed finding → state becomes RESOLVED', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });

		await new Resolve(new Command(), BASE_CONFIG, makeKernel(), [], TEST_PRINTER, ledger).action({
			fingerprint: FINGERPRINT,
		});

		const state = await ledger.getState();
		expect(state.findings[FINGERPRINT]?.state).toBe(FindingStatus.RESOLVED);
	});
});

// ── visualize ────────────────────────────────────────────────────────────────

describe('visualize', () => {
	test('does not run insights unless --insights is passed', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });
		const analyzeSpy = mockInsight().analyze;

		await makeVisualize(ledger, [{ id: 'test-insight', needRules: ['test@v1'], analyze: analyzeSpy }]).action({});

		expect(analyzeSpy).not.toHaveBeenCalled();
	});

	test('prints insights with the shared printer method', async () => {
		const ledger = new FilePathLedgerBackend({ path: ledgerPath });
		await makeCheck([RULE_OUTPUT], ledger).action({ ledger: true });
		const insight = mockInsight();
		const printerSpy = spyOn(Printer.prototype, 'insight');

		await makeVisualize(ledger, [insight]).action({ insights: true });

		expect(printerSpy).toHaveBeenCalledWith({
			insightId: 'test-insight',
			message: 'test insight',
			data: { findingCount: 1 },
		});
	});
});

function mockInsight(): Insight {
	return {
		id: 'test-insight',
		needRules: ['test@v1'],
		analyze: spyOn(
			{
				analyze: (findings: Finding[]) => [
					{
						insightId: 'test-insight',
						message: 'test insight',
						data: { findingCount: findings.length },
					},
				],
			},
			'analyze',
		),
	};
}
