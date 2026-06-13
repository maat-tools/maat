import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { LedgerHarness, runCli, stripAnsi } from '@maat-tools/testing';

const SAMPLE_CONFIG = resolve(import.meta.dir, '../fixtures/sample-project/maat.config.ts');

const TIMEOUT = 30_000;

function extractFingerprint(stdout: string): string {
	const match = stdout.match(/\b[a-f0-9]{64}\b/);
	expect(match).not.toBeNull();
	return match?.[0] as string;
}

describe('maat resolve', () => {
	const ledger = new LedgerHarness();

	beforeEach(async () => await ledger.setup());
	afterEach(async () => await ledger.teardown());

	test(
		'exits 1 without a ledger configured',
		() => {
			const result = runCli(['resolve', '--fingerprint', 'anything'], { config: SAMPLE_CONFIG });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('No ledger configured');
		},
		TIMEOUT,
	);

	test(
		'exits 1 when fingerprint is not in the ledger',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const result = runCli(['resolve', '--fingerprint', 'does-not-exist'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('does-not-exist');
		},
		TIMEOUT,
	);

	test(
		'resolves an observed finding',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const check = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			const fingerprint = extractFingerprint(check.stdout);

			const result = runCli(['resolve', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain(`"${fingerprint}" resolved`);
		},
		TIMEOUT,
	);

	test(
		'resolving an already-resolved finding warns without exiting',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const check = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			const fingerprint = extractFingerprint(check.stdout);

			runCli(['resolve', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			const result = runCli(['resolve', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(stripAnsi(result.stderr)).toContain('already resolved');
		},
		TIMEOUT,
	);

	test(
		'resolved finding that still exists in code → regression, check exits 1',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const check1 = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			const fingerprint = extractFingerprint(check1.stdout);

			runCli(['resolve', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });

			const check2 = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			expect(check2.exitCode).toBe(1);
		},
		TIMEOUT,
	);
});
