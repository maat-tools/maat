import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { FindingRuleOutput } from '@maat-tools/contracts';
import { FindingStatus } from '@maat-tools/contracts';
import type { MaatConfig } from '@maat-tools/core';
import { Kernel } from '@maat-tools/kernel';
import { ConsoleCapture, ExitCapture, LedgerHarness, scenarioObserved, scenarioResolved } from '@maat-tools/testing';
import { Command } from 'commander';
import { Resolve } from '../../packages/cli/src/commands/resolve';
import { Printer } from '../../packages/cli/src/printer';

const BASE_CONFIG: MaatConfig = { collectors: [], rules: [] };

const FINDING: FindingRuleOutput = {
	ruleId: 'test@v1',
	ruleIdentifier: { id: 'finding-a' },
	message: 'finding a',
	artifacts: [],
};

function buildResolve(ledger: LedgerHarness | null) {
	return new Resolve(new Command(), BASE_CONFIG, new Kernel(), [], new Printer(), ledger?.backend ?? null);
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

describe('resolve', () => {
	test('no ledger configured → exit 1', async () => {
		await expect(buildResolve(null).action({ fingerprint: 'anything' })).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
		expect(capture.stderr).toContain('No ledger configured');
	});

	test('fingerprint not in ledger → exit 1', async () => {
		await expect(buildResolve(ledger).action({ fingerprint: 'does-not-exist' })).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
		expect(capture.stderr).toContain('does-not-exist');
	});

	test('observed finding → resolved state, logs success', async () => {
		const fp = await scenarioObserved(ledger, FINDING);
		await buildResolve(ledger).action({ fingerprint: fp });
		exit.assertNotExited();
		const record = await ledger.backend.getFindingByFingerprint(fp);
		expect(record?.state).toBe(FindingStatus.RESOLVED);
		expect(capture.stdout).toContain(`"${fp}" resolved`);
	});

	test('already-resolved finding → warns, no exit, state unchanged', async () => {
		const fp = await scenarioResolved(ledger, FINDING);
		await buildResolve(ledger).action({ fingerprint: fp });
		exit.assertNotExited();
		expect(capture.stderr).toContain('already resolved');
		const record = await ledger.backend.getFindingByFingerprint(fp);
		expect(record?.state).toBe(FindingStatus.RESOLVED);
	});
});
