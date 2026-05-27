import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { LedgerHarness, runCli } from '@maat-tools/testing';

const SAMPLE_CONFIG = resolve(import.meta.dir, '../fixtures/sample-project/maat.config.ts');

const TIMEOUT = 30_000;

describe('maat — check → baseline → check loop', () => {
	const ledger = new LedgerHarness();

	beforeEach(async () => await ledger.setup());
	afterEach(async () => await ledger.teardown());

	test(
		'findings are filtered out after baselining',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const check1 = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			expect(check1.exitCode).toBe(1);

			const base = runCli(['baseline'], { config: SAMPLE_CONFIG, env });
			expect(base.exitCode).toBe(0);
			expect(base.stdout).toContain('Baselined');

			const check2 = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			expect(check2.exitCode).toBe(0);
		},
		TIMEOUT,
	);

	test(
		'visualize shows findings as observed after first check',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });

			const viz = runCli(['visualize'], { config: SAMPLE_CONFIG, env });
			expect(viz.exitCode).toBe(0);
			expect(viz.stdout.toLowerCase()).toContain('observed');
		},
		TIMEOUT,
	);

	test(
		'visualize shows no observed findings after baseline',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			runCli(['baseline'], { config: SAMPLE_CONFIG, env });

			// After baseline, no "observed" section — findings move to "baselined"
			const viz = runCli(['visualize'], { config: SAMPLE_CONFIG, env });
			expect(viz.exitCode).toBe(0);
			expect(viz.stdout.toLowerCase()).not.toContain('observed');
		},
		TIMEOUT,
	);
});
