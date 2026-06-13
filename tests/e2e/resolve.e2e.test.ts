import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { FindingStatus } from '@maat-tools/contracts';
import {
	LedgerHarness,
	runCli,
	scenarioBaselined,
	scenarioObserved,
	scenarioUnverified,
	stripAnsi,
} from '@maat-tools/testing';

const SAMPLE_CONFIG = resolve(import.meta.dir, '../fixtures/sample-project/maat.config.ts');

const TIMEOUT = 30_000;

const SAMPLE_OUTPUT = {
	ruleId: 'test-rule',
	ruleIdentifier: { test: true },
	message: 'test finding',
	artifacts: [],
};

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
		'exits 1 when --fingerprint is missing',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const result = runCli(['resolve'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
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
		'successful resolve output includes the fingerprint',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const fingerprint = await scenarioObserved(ledger, SAMPLE_OUTPUT);

			const result = runCli(['resolve', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain(fingerprint);
			expect(result.stdout).toContain('resolved');
		},
		TIMEOUT,
	);

	test(
		'resolving an already-resolved finding exits 1 with warning',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const check = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			const fingerprint = extractFingerprint(check.stdout);

			runCli(['resolve', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			const result = runCli(['resolve', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('already resolved');
		},
		TIMEOUT,
	);

	test(
		'resolving a revoked finding exits 1',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const fingerprint = await scenarioUnverified(ledger, SAMPLE_OUTPUT);
			await ledger.backend.append({
				type: FindingStatus.REVOKED,
				timestamp: new Date().toISOString(),
				fingerprint,
				ruleId: SAMPLE_OUTPUT.ruleId,
				instanceId: SAMPLE_OUTPUT.ruleId,
				message: SAMPLE_OUTPUT.message,
				artifacts: SAMPLE_OUTPUT.artifacts,
			});

			const result = runCli(['resolve', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('revoked');
		},
		TIMEOUT,
	);

	test(
		'resolving an unverified finding exits 1',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const fingerprint = await scenarioUnverified(ledger, SAMPLE_OUTPUT);

			const result = runCli(['resolve', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('unverified');
		},
		TIMEOUT,
	);

	test(
		'resolving a baselined finding warns and succeeds',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const fingerprint = await scenarioBaselined(ledger, SAMPLE_OUTPUT);

			const result = runCli(['resolve', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(stripAnsi(result.stderr)).toContain('baselined');
			expect(result.stdout).toContain('resolved');
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

	test(
		'resolving a finding seeded in ledger that does not exist in codebase succeeds',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const fingerprint = await scenarioObserved(ledger, SAMPLE_OUTPUT);

			const result = runCli(['resolve', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('resolved');
		},
		TIMEOUT,
	);
});
