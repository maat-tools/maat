import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { RuleOutput } from '@maat-tools/contracts';
import { FindingStatus } from '@maat-tools/contracts';
import type { MaatConfig } from '@maat-tools/core';
import { Kernel } from '@maat-tools/kernel';
import { ConsoleCapture, ExitCapture, LedgerHarness, scenarioObserved } from '@maat-tools/testing';
import { StdoutPresenter } from '@maat-tools/utils';
import { Command } from 'commander';
import { Axiom } from '../../packages/cli/src/commands/axiom';

const BASE_CONFIG: MaatConfig = { collectors: [], rules: [] };

const FINDING: RuleOutput = {
	ruleId: 'test@v1',
	ruleIdentifier: { id: 'finding-a' },
	message: 'finding a',
	artifacts: [],
};

const DECLARE_OPTS = {
	id: 'axiom-001',
	scope: 'kernel',
	claim: 'Kernel is always pure',
} as const;

type LifecycleOptions = { id: string; reason?: string };

function buildAxiom(ledger: LedgerHarness | null) {
	return new Axiom(new Command(), BASE_CONFIG, new Kernel(), [], new StdoutPresenter(), ledger?.backend ?? null);
}

function supersede(axiom: Axiom, opts: LifecycleOptions): Promise<void> {
	return (axiom as unknown as { lifecycle: (t: string, o: LifecycleOptions) => Promise<void> }).lifecycle(
		FindingStatus.AXIOM_SUPERSEDED,
		opts,
	);
}

function revoke(axiom: Axiom, opts: LifecycleOptions): Promise<void> {
	return (axiom as unknown as { lifecycle: (t: string, o: LifecycleOptions) => Promise<void> }).lifecycle(
		FindingStatus.AXIOM_REVOKED,
		opts,
	);
}

const exit = new ExitCapture();
const capture = new ConsoleCapture();
const ledger = new LedgerHarness();

beforeEach(async () => {
	exit.setup();
	capture.setup();
	await ledger.setup();
});

afterEach(async () => {
	exit.teardown();
	capture.teardown();
	await ledger.teardown();
});

describe('axiom declare', () => {
	test('no ledger → exit 1', async () => {
		await expect(buildAxiom(null).action(DECLARE_OPTS)).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
		expect(capture.stderr).toContain('No ledger configured');
	});

	test('axiom ID already active, no --force → exit 1', async () => {
		await buildAxiom(ledger).action(DECLARE_OPTS);
		await expect(buildAxiom(ledger).action(DECLARE_OPTS)).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
		expect(capture.stderr).toContain('already exists');
		expect(capture.stderr).toContain('--force');
	});

	test('axiom ID already active, --force → re-declares successfully', async () => {
		await buildAxiom(ledger).action(DECLARE_OPTS);
		await buildAxiom(ledger).action({ ...DECLARE_OPTS, force: true });
		exit.assertNotExited();
		expect(capture.stdout).toContain(`"${DECLARE_OPTS.id}" declared`);
	});

	test('fingerprint in --fingerprints not found in ledger → exit 1', async () => {
		await expect(buildAxiom(ledger).action({ ...DECLARE_OPTS, fingerprints: 'nonexistent-fp' })).rejects.toThrow(
			'process.exit',
		);
		exit.assertExitedWith(1);
		expect(capture.stderr).toContain('nonexistent-fp');
	});

	test('clean declare → axiom active in ledger', async () => {
		await buildAxiom(ledger).action(DECLARE_OPTS);
		exit.assertNotExited();
		const axiom = await ledger.backend.getAxiomByFingerprint(DECLARE_OPTS.id);
		expect(axiom?.type).toBe(FindingStatus.AXIOM_DECLARED);
		expect(axiom?.claim).toBe(DECLARE_OPTS.claim);
		expect(capture.stdout).toContain(`"${DECLARE_OPTS.id}" declared`);
	});

	test('declare with valid fingerprints → axiom links to findings', async () => {
		const fp = await scenarioObserved(ledger, FINDING);
		await buildAxiom(ledger).action({ ...DECLARE_OPTS, fingerprints: fp });
		exit.assertNotExited();
		const axiom = await ledger.backend.getAxiomByFingerprint(DECLARE_OPTS.id);
		expect(axiom?.fingerprints).toEqual([fp]);
	});
});

describe('axiom supersede / revoke', () => {
	test('supersede: no ledger → exit 1', async () => {
		await expect(supersede(buildAxiom(null), { id: DECLARE_OPTS.id })).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
		expect(capture.stderr).toContain('No ledger configured');
	});

	test('supersede: axiom not found → exit 1', async () => {
		await expect(supersede(buildAxiom(ledger), { id: 'unknown' })).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
		expect(capture.stderr).toContain('not found');
	});

	test('supersede: already-inactive axiom → exit 1', async () => {
		await buildAxiom(ledger).action(DECLARE_OPTS);
		await supersede(buildAxiom(ledger), { id: DECLARE_OPTS.id });
		await expect(supersede(buildAxiom(ledger), { id: DECLARE_OPTS.id })).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
		expect(capture.stderr).toContain('already inactive');
	});

	test('supersede active axiom → active: false', async () => {
		await buildAxiom(ledger).action(DECLARE_OPTS);
		await supersede(buildAxiom(ledger), { id: DECLARE_OPTS.id });
		exit.assertNotExited();
		expect((await ledger.backend.getAxiomByFingerprint(DECLARE_OPTS.id))?.type).toBe(FindingStatus.AXIOM_SUPERSEDED);
	});

	test('revoke active axiom → active: false', async () => {
		await buildAxiom(ledger).action(DECLARE_OPTS);
		await revoke(buildAxiom(ledger), { id: DECLARE_OPTS.id });
		exit.assertNotExited();
		expect((await ledger.backend.getAxiomByFingerprint(DECLARE_OPTS.id))?.type).toBe(FindingStatus.AXIOM_REVOKED);
	});
});
