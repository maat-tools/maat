import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { LedgerHarness, runCli } from '@maat-tools/testing';

const SAMPLE_CONFIG = resolve(import.meta.dir, '../fixtures/sample-project/maat.config.ts');

const TIMEOUT = 30_000;

describe('maat axiom declare', () => {
	const ledger = new LedgerHarness();

	beforeEach(async () => await ledger.setup());
	afterEach(async () => await ledger.teardown());

	test(
		'declares an axiom successfully',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const result = runCli(
				[
					'axiom',
					'declare',
					'--id',
					'ax-001',
					'--scope',
					'kernel',
					'--claim',
					'No direct DB calls outside repository layer',
				],
				{ config: SAMPLE_CONFIG, env },
			);

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('ax-001');
			expect(result.stdout).toContain('kernel');
			expect(result.stdout).toContain('No direct DB calls outside repository layer');
		},
		TIMEOUT,
	);

	test(
		'declares an axiom with a note',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const result = runCli(
				[
					'axiom',
					'declare',
					'--id',
					'ax-note',
					'--scope',
					'api',
					'--claim',
					'All endpoints require auth',
					'--note',
					'ADR-0042',
				],
				{ config: SAMPLE_CONFIG, env },
			);

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('ADR-0042');
		},
		TIMEOUT,
	);

	test(
		'exits 1 when fingerprints reference non-existent findings',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const result = runCli(
				[
					'axiom',
					'declare',
					'--id',
					'ax-bad-fp',
					'--scope',
					'kernel',
					'--claim',
					'Test',
					'--fingerprints',
					'nonexistent-fp-123',
				],
				{ config: SAMPLE_CONFIG, env },
			);

			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain('nonexistent-fp-123');
		},
		TIMEOUT,
	);

	test(
		'exits 1 without a ledger configured',
		() => {
			const result = runCli(['axiom', 'declare', '--id', 'ax-no-ledger', '--scope', 'kernel', '--claim', 'Test'], {
				config: SAMPLE_CONFIG,
			});

			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain('No ledger configured');
		},
		TIMEOUT,
	);

	test(
		'declares an axiom linked to valid finding fingerprints',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const check = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			expect(check.exitCode).toBe(1);

			const fingerprintMatch = check.stdout.match(/\b[a-f0-9]{64}\b/);
			expect(fingerprintMatch).not.toBeNull();

			const fingerprint = fingerprintMatch?.[0] as string;
			const result = runCli(
				[
					'axiom',
					'declare',
					'--id',
					'ax-with-fp',
					'--scope',
					'core',
					'--claim',
					'Known violation accepted',
					'--fingerprints',
					fingerprint,
				],
				{ config: SAMPLE_CONFIG, env },
			);

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('ax-with-fp');
			expect(result.stdout).toContain(fingerprint);
		},
		TIMEOUT,
	);
});

describe('maat axiom supersede', () => {
	const ledger = new LedgerHarness();

	beforeEach(async () => await ledger.setup());
	afterEach(async () => await ledger.teardown());

	test(
		'supersedes an active axiom',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			runCli(['axiom', 'declare', '--id', 'ax-sup', '--scope', 'kernel', '--claim', 'Old claim'], {
				config: SAMPLE_CONFIG,
				env,
			});

			const result = runCli(['axiom', 'supersede', '--id', 'ax-sup', '--reason', 'Replaced by ADR-0099'], {
				config: SAMPLE_CONFIG,
				env,
			});

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toContain('ax-sup');
			expect(result.stderr).toContain('superseded');
			expect(result.stdout).toContain('Replaced by ADR-0099');
		},
		TIMEOUT,
	);

	test(
		'exits 1 when axiom id not found',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const result = runCli(['axiom', 'supersede', '--id', 'nonexistent-axiom', '--reason', 'Not needed'], {
				config: SAMPLE_CONFIG,
				env,
			});

			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain('not found');
		},
		TIMEOUT,
	);

	test(
		'exits 1 when axiom is already inactive',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			runCli(['axiom', 'declare', '--id', 'ax-inactive', '--scope', 'kernel', '--claim', 'Test'], {
				config: SAMPLE_CONFIG,
				env,
			});
			runCli(['axiom', 'supersede', '--id', 'ax-inactive', '--reason', 'Replaced'], { config: SAMPLE_CONFIG, env });

			const result = runCli(['axiom', 'supersede', '--id', 'ax-inactive', '--reason', 'Replaced again'], {
				config: SAMPLE_CONFIG,
				env,
			});

			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain('inactive');
		},
		TIMEOUT,
	);

	test(
		'exits 1 without a ledger configured',
		() => {
			const result = runCli(['axiom', 'supersede', '--id', 'ax-no-ledger', '--reason', 'Test'], {
				config: SAMPLE_CONFIG,
			});

			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain('No ledger configured');
		},
		TIMEOUT,
	);
});

describe('maat axiom revoke', () => {
	const ledger = new LedgerHarness();

	beforeEach(async () => await ledger.setup());
	afterEach(async () => await ledger.teardown());

	test(
		'revokes an active axiom',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			runCli(['axiom', 'declare', '--id', 'ax-revoke', '--scope', 'kernel', '--claim', 'Test claim'], {
				config: SAMPLE_CONFIG,
				env,
			});

			const result = runCli(['axiom', 'revoke', '--id', 'ax-revoke', '--reason', 'No longer applicable'], {
				config: SAMPLE_CONFIG,
				env,
			});

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toContain('ax-revoke');
			expect(result.stderr).toContain('revoked');
		},
		TIMEOUT,
	);

	test(
		'exits 1 when axiom id not found',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const result = runCli(['axiom', 'revoke', '--id', 'nonexistent-axiom', '--reason', 'Not needed'], {
				config: SAMPLE_CONFIG,
				env,
			});

			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain('not found');
		},
		TIMEOUT,
	);

	test(
		'exits 1 when axiom is already inactive',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			runCli(['axiom', 'declare', '--id', 'ax-revoked', '--scope', 'kernel', '--claim', 'Test'], {
				config: SAMPLE_CONFIG,
				env,
			});
			runCli(['axiom', 'revoke', '--id', 'ax-revoked', '--reason', 'Deprecated'], { config: SAMPLE_CONFIG, env });

			const result = runCli(['axiom', 'revoke', '--id', 'ax-revoked', '--reason', 'Deprecated again'], {
				config: SAMPLE_CONFIG,
				env,
			});

			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain('inactive');
		},
		TIMEOUT,
	);

	test(
		'exits 1 without a ledger configured',
		() => {
			const result = runCli(['axiom', 'revoke', '--id', 'ax-no-ledger', '--reason', 'Test'], { config: SAMPLE_CONFIG });

			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain('No ledger configured');
		},
		TIMEOUT,
	);
});

describe('maat axiom lifecycle — check and visualize integration', () => {
	const ledger = new LedgerHarness();

	beforeEach(async () => await ledger.setup());
	afterEach(async () => await ledger.teardown());

	test(
		'check shows axiom count in summary after declaring an axiom',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			runCli(
				[
					'axiom',
					'declare',
					'--id',
					'ax-integration',
					'--scope',
					'kernel',
					'--claim',
					'All services must use repository layer',
				],
				{ config: SAMPLE_CONFIG, env },
			);

			const result = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(result.stdout.toLowerCase()).toContain('axiom');
		},
		TIMEOUT,
	);

	test(
		'visualize displays declared axiom',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			runCli(['axiom', 'declare', '--id', 'ax-viz', '--scope', 'kernel', '--claim', 'No direct DB calls'], {
				config: SAMPLE_CONFIG,
				env,
			});

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('ax-viz');
			expect(result.stdout).toContain('No direct DB calls');
		},
		TIMEOUT,
	);

	test(
		'superseded axiom does not appear as active in check',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			runCli(['axiom', 'declare', '--id', 'ax-super-check', '--scope', 'kernel', '--claim', 'Old claim'], {
				config: SAMPLE_CONFIG,
				env,
			});
			runCli(['axiom', 'supersede', '--id', 'ax-super-check', '--reason', 'Updated policy'], {
				config: SAMPLE_CONFIG,
				env,
			});

			const result = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
		},
		TIMEOUT,
	);

	test(
		'revoked axiom does not appear as active in check',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			runCli(['axiom', 'declare', '--id', 'ax-revoke-check', '--scope', 'kernel', '--claim', 'Deprecated claim'], {
				config: SAMPLE_CONFIG,
				env,
			});
			runCli(['axiom', 'revoke', '--id', 'ax-revoke-check', '--reason', 'No longer valid'], {
				config: SAMPLE_CONFIG,
				env,
			});

			const result = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
		},
		TIMEOUT,
	);
});
