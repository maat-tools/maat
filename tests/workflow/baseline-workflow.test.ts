import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { FindingRuleOutput } from '@maat-tools/contracts';
import type { MaatConfig } from '@maat-tools/core';
import { Kernel } from '@maat-tools/kernel';
import { ConsoleCapture, ExitCapture, LedgerHarness, scenarioObserved } from '@maat-tools/testing';
import { Command } from 'commander';
import { Baseline } from '../../packages/cli/src/commands/baseline';
import { Printer } from '../../packages/cli/src/printer';

const BASE_CONFIG: MaatConfig = { collectors: [], rules: [] };

const FINDING_A: FindingRuleOutput = {
	ruleId: 'test@v1',
	ruleIdentifier: { id: 'finding-a' },
	message: 'finding a',
	artifacts: [],
};

const FINDING_B: FindingRuleOutput = {
	ruleId: 'test@v1',
	ruleIdentifier: { id: 'finding-b' },
	message: 'finding b',
	artifacts: [],
};

function buildBaseline(ledger: LedgerHarness | null, config: MaatConfig = BASE_CONFIG) {
	return new Baseline(new Command(), config, new Kernel(), [], new Printer(), ledger?.backend ?? null);
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

describe('baseline — no ledger', () => {
	test('no ledger configured → exit 1 with error', async () => {
		await expect(buildBaseline(null).action({})).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
		expect(capture.stderr).toContain('No ledger configured');
	});
});

describe('baseline — --expires-in validation', () => {
	test('non-numeric value → exit 1', async () => {
		await scenarioObserved(ledger, FINDING_A);
		await expect(buildBaseline(ledger).action({ expiresIn: 'abc' })).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
		expect(capture.stderr).toContain('must be an integer');
	});

	test('zero → exit 1', async () => {
		await scenarioObserved(ledger, FINDING_A);
		await expect(buildBaseline(ledger).action({ expiresIn: '0' })).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
		expect(capture.stderr).toContain('at least 1');
	});

	test('above max (91) → exit 1', async () => {
		await scenarioObserved(ledger, FINDING_A);
		await expect(buildBaseline(ledger).action({ expiresIn: '91' })).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
		expect(capture.stderr).toContain('at most 90');
	});
});

describe('baseline — behaviour', () => {
	test('nothing to baseline → no exit, no-op message', async () => {
		await buildBaseline(ledger).action({});
		exit.assertNotExited();
		expect(capture.stdout).toContain('Nothing to baseline');
	});

	test('one observed finding → baselined with default 30 days', async () => {
		const fp = await scenarioObserved(ledger, FINDING_A);
		await buildBaseline(ledger).action({});
		exit.assertNotExited();
		const record = await ledger.backend.getFindingByFingerprint(fp);
		expect(record?.baselined).toBe(true);
		expect(capture.stdout).toContain('Baselined 1 finding(s)');
		expect(capture.stdout).toContain('30 day(s)');
	});

	test('multiple observed findings → all baselined', async () => {
		const fpA = await scenarioObserved(ledger, FINDING_A);
		const fpB = await scenarioObserved(ledger, FINDING_B);
		await buildBaseline(ledger).action({});
		exit.assertNotExited();
		expect((await ledger.backend.getFindingByFingerprint(fpA))?.baselined).toBe(true);
		expect((await ledger.backend.getFindingByFingerprint(fpB))?.baselined).toBe(true);
		expect(capture.stdout).toContain('Baselined 2 finding(s)');
	});

	test('explicit --expires-in 7 → correct expiry in output', async () => {
		await scenarioObserved(ledger, FINDING_A);
		await buildBaseline(ledger).action({ expiresIn: '7' });
		exit.assertNotExited();
		expect(capture.stdout).toContain('7 day(s)');
	});

	test('already-baselined finding is not re-baselined', async () => {
		const fp = await scenarioObserved(ledger, FINDING_A);
		await buildBaseline(ledger).action({ expiresIn: '7' });
		const firstExpiry = (await ledger.backend.getFindingByFingerprint(fp))?.baseline_expires_at;

		await buildBaseline(ledger).action({ expiresIn: '60' });
		const secondExpiry = (await ledger.backend.getFindingByFingerprint(fp))?.baseline_expires_at;

		expect(secondExpiry).toBe(firstExpiry);
		expect(capture.stdout).toContain('Nothing to baseline');
	});
});
