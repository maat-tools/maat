import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FindingStatus, type RuleOutput } from '@maat-tools/contracts';
import {
	LedgerHarness,
	runCli,
	scenarioBaselined,
	scenarioObserved,
	scenarioResolved,
	scenarioUnverified,
	stripAnsi,
} from '@maat-tools/testing';

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

async function scenarioRevoked(ledger: LedgerHarness, finding: RuleOutput): Promise<string> {
	const fingerprint = await scenarioUnverified(ledger, finding);
	await ledger.backend.append({
		type: FindingStatus.REVOKED,
		timestamp: new Date().toISOString(),
		fingerprint,
		ruleId: finding.ruleId,
		instanceId: finding.ruleId,
		message: finding.message,
		artifacts: finding.artifacts,
	});
	return fingerprint;
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
		'exits 1 when --fingerprint is missing',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const result = runCli(['verify'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
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
		'verifying an observed finding exits 1 with warning',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioObserved(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
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
			expect(stripAnsi(result.stderr)).toContain('already verified');
		},
		TIMEOUT,
	);

	test(
		'verifying a revoked finding exits 1',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioRevoked(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('not in an unverified state');
		},
		TIMEOUT,
	);

	test(
		'--revoke on a revoked finding exits 1',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioRevoked(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint, '--revoke'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('not in an unverified state');
		},
		TIMEOUT,
	);

	test(
		'verifying a baselined finding exits 1',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioBaselined(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('not in an unverified state');
		},
		TIMEOUT,
	);

	test(
		'verifying a resolved finding exits 1',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioResolved(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('not in an unverified state');
		},
		TIMEOUT,
	);

	test(
		'--reason on verify is persisted in the observed event',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioUnverified(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint, '--reason', 'approved by team'], {
				config: SAMPLE_CONFIG,
				env,
			});
			expect(result.exitCode).toBe(0);

			const event = await lastEventForFingerprint(ledger.path, fingerprint);
			expect(event.type).toBe('finding.observed');
			expect(event.reason).toBe('approved by team');
		},
		TIMEOUT,
	);

	test(
		'--reason on revoke is persisted in the revoked event',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioUnverified(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint, '--revoke', '--reason', 'false positive'], {
				config: SAMPLE_CONFIG,
				env,
			});
			expect(result.exitCode).toBe(0);

			const event = await lastEventForFingerprint(ledger.path, fingerprint);
			expect(event.type).toBe('finding.revoked');
			expect(event.reason).toBe('false positive');
		},
		TIMEOUT,
	);

	test(
		'--reopen on a revoked finding → transitions back to unverified',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioRevoked(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint, '--reopen'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);

			const event = await lastEventForFingerprint(ledger.path, fingerprint);
			expect(event.type).toBe('finding.unverified');
		},
		TIMEOUT,
	);

	test(
		'--reopen on a finding that is not revoked → exit 1',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioObserved(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint, '--reopen'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr).toLowerCase()).toContain('revoked');
		},
		TIMEOUT,
	);

	test(
		'--revoke and --reopen together → exit 1 before touching the ledger',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			// "anything" is not in the ledger: the conflict must be rejected before lookup.
			const result = runCli(['verify', '--fingerprint', 'anything', '--revoke', '--reopen'], {
				config: SAMPLE_CONFIG,
				env,
			});
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr).toLowerCase()).toContain('together');
		},
		TIMEOUT,
	);

	test(
		'--reopen on an unverified finding → exit 1 and does not change state',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioUnverified(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint, '--reopen'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('not revoked');

			const event = await lastEventForFingerprint(ledger.path, fingerprint);
			expect(event.type).toBe('finding.unverified');
		},
		TIMEOUT,
	);

	test(
		'--reopen on a baselined finding → exit 1',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioBaselined(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint, '--reopen'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('not revoked');
		},
		TIMEOUT,
	);

	test(
		'--reopen on a resolved finding → exit 1',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioResolved(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint, '--reopen'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('not revoked');
		},
		TIMEOUT,
	);

	test(
		'--reopen restores requiresVerification and announces the reopen',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioRevoked(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint, '--reopen'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(result.stdout.toLowerCase()).toContain('reopened');

			const event = await lastEventForFingerprint(ledger.path, fingerprint);
			expect(event.type).toBe('finding.unverified');
			expect(event.requiresVerification).toBe(true);
		},
		TIMEOUT,
	);

	test(
		'--reason on reopen is persisted in the unverified event',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioRevoked(ledger, FINDING);

			const result = runCli(
				['verify', '--fingerprint', fingerprint, '--reopen', '--reason', 'reopened for re-review'],
				{
					config: SAMPLE_CONFIG,
					env,
				},
			);
			expect(result.exitCode).toBe(0);

			const event = await lastEventForFingerprint(ledger.path, fingerprint);
			expect(event.type).toBe('finding.unverified');
			expect(event.reason).toBe('reopened for re-review');
		},
		TIMEOUT,
	);

	test(
		'a revoked finding can be reopened and then re-verified',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioRevoked(ledger, FINDING);

			const reopen = runCli(['verify', '--fingerprint', fingerprint, '--reopen'], { config: SAMPLE_CONFIG, env });
			expect(reopen.exitCode).toBe(0);

			const verify = runCli(['verify', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			expect(verify.exitCode).toBe(0);

			const event = await lastEventForFingerprint(ledger.path, fingerprint);
			expect(event.type).toBe('finding.observed');
		},
		TIMEOUT,
	);

	test(
		'--revoke on a baselined finding → exit 1',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioBaselined(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint, '--revoke'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('not in an unverified state');
		},
		TIMEOUT,
	);

	test(
		'--revoke on a resolved finding → exit 1',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = await scenarioResolved(ledger, FINDING);

			const result = runCli(['verify', '--fingerprint', fingerprint, '--revoke'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('not in an unverified state');
		},
		TIMEOUT,
	);
});
