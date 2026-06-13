import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { RuleOutput } from '@maat-tools/contracts';
import { LedgerHarness, runCli, scenarioObserved, scenarioUnverified, stripAnsi } from '@maat-tools/testing';

const SAMPLE_CONFIG = resolve(import.meta.dir, '../fixtures/sample-project/maat.config.ts');

const TIMEOUT = 30_000;

const FINDING: RuleOutput = {
	ruleId: 'test@v1',
	ruleIdentifier: { id: 'finding-a' },
	message: 'finding a',
	artifacts: [],
};

async function lastEventForFingerprint(ledgerPath: string, fingerprint: string): Promise<Record<string, unknown>> {
	const content = await readFile(ledgerPath, 'utf-8');
	const events = content
		.trim()
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Record<string, unknown>)
		.filter((event) => event.fingerprint === fingerprint);
	const last = events.at(-1);
	expect(last).toBeDefined();
	return last as Record<string, unknown>;
}

describe('maat verify', () => {
	const ledger = new LedgerHarness();

	beforeEach(async () => await ledger.setup());
	afterEach(async () => await ledger.teardown());

	test(
		'exits 1 without a ledger configured',
		() => {
			const result = runCli(['verify', '--fingerprint', 'anything'], { config: SAMPLE_CONFIG });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('No ledger configured');
		},
		TIMEOUT,
	);

	test(
		'exits 1 when fingerprint is not in the ledger',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const result = runCli(['verify', '--fingerprint', 'does-not-exist'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('does-not-exist');
		},
		TIMEOUT,
	);

	test(
		'verifies an unverified finding → transitions to observed',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioUnverified(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain(`"${fingerprint}" verified`);

			const event = await lastEventForFingerprint(ledger.path, fingerprint);
			expect(event.type).toBe('finding.observed');
		},
		TIMEOUT,
	);

	test(
		'verifying an observed finding warns without state change',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioObserved(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(stripAnsi(result.stderr)).toContain('already verified');

			const event = await lastEventForFingerprint(ledger.path, fingerprint);
			expect(event.type).toBe('finding.observed');
		},
		TIMEOUT,
	);

	test(
		'--revoke on an unverified finding → transitions to revoked',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioUnverified(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint, '--revoke'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('revoked');

			const event = await lastEventForFingerprint(ledger.path, fingerprint);
			expect(event.type).toBe('finding.revoked');
		},
		TIMEOUT,
	);

	test(
		'--revoke on an observed finding → exit 1',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioObserved(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint, '--revoke'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('not in an unverified state');
		},
		TIMEOUT,
	);
});
