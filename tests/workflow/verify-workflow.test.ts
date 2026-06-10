import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { FindingRuleOutput } from '@maat-tools/contracts';
import { FindingStatus } from '@maat-tools/contracts';
import type { MaatConfig } from '@maat-tools/core';
import { Kernel } from '@maat-tools/kernel';
import { ConsoleCapture, ExitCapture, LedgerHarness, scenarioObserved, scenarioUnverified } from '@maat-tools/testing';
import { Command } from 'commander';
import { Verify } from '../../packages/cli/src/commands/verify';
import { StdoutPresenter } from '@maat-tools/utils';

const BASE_CONFIG: MaatConfig = { collectors: [], rules: [] };

const FINDING: FindingRuleOutput = {
	ruleId: 'test@v1',
	ruleIdentifier: { id: 'finding-a' },
	message: 'finding a',
	artifacts: [],
};

function buildVerify(ledger: LedgerHarness | null) {
	return new Verify(new Command(), BASE_CONFIG, new Kernel(), [], new StdoutPresenter(), ledger?.backend ?? null);
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

describe('verify', () => {
	test('no ledger configured → exit 1', async () => {
		await expect(buildVerify(null).action({ fingerprint: 'anything' })).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
		expect(capture.stderr).toContain('No ledger configured');
	});

	test('fingerprint not in ledger → exit 1', async () => {
		await expect(buildVerify(ledger).action({ fingerprint: 'does-not-exist' })).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
		expect(capture.stderr).toContain('does-not-exist');
	});

	test('observed finding → warns already verified, no state change', async () => {
		const fp = await scenarioObserved(ledger, FINDING);
		await buildVerify(ledger).action({ fingerprint: fp });
		exit.assertNotExited();
		expect(capture.stderr).toContain('already verified');
		expect((await ledger.backend.getFindingByFingerprint(fp))?.state).toBe(FindingStatus.OBSERVED);
	});

	test('unverified finding → transitions to OBSERVED, logs success', async () => {
		const fp = await scenarioUnverified(ledger, FINDING);
		await buildVerify(ledger).action({ fingerprint: fp });
		exit.assertNotExited();
		expect((await ledger.backend.getFindingByFingerprint(fp))?.state).toBe(FindingStatus.OBSERVED);
		expect(capture.stdout).toContain(`"${fp}" verified`);
	});

	test('--revoke on unverified finding → transitions to REVOKED, logs success', async () => {
		const fp = await scenarioUnverified(ledger, FINDING);
		await buildVerify(ledger).action({ fingerprint: fp, revoke: true });
		exit.assertNotExited();
		expect((await ledger.backend.getFindingByFingerprint(fp))?.state).toBe(FindingStatus.REVOKED);
		expect(capture.stdout).toContain('revoked');
	});

	test('--revoke on observed finding → exit 1, not in unverified state', async () => {
		const fp = await scenarioObserved(ledger, FINDING);
		await expect(buildVerify(ledger).action({ fingerprint: fp, revoke: true })).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
		expect(capture.stderr).toContain('not in an unverified state');
	});
});
