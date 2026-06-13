import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LedgerHarness, runCli, stripAnsi } from '@maat-tools/testing';

const SAMPLE_CONFIG = resolve(import.meta.dir, '../fixtures/sample-project/maat.config.ts');

const TIMEOUT = 30_000;

type RawLedgerEntry = Record<string, unknown>;

async function readLedgerEntries(ledgerPath: string): Promise<RawLedgerEntry[]> {
	const content = await readFile(ledgerPath, 'utf-8');
	if (!content.trim()) {
		return [];
	}
	return content
		.trim()
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

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

	describe('--expires-in validation', () => {
		test(
			'non-numeric value → exit 1',
			() => {
				const env = { MAAT_TEST_LEDGER: ledger.path };
				runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });

				const base = runCli(['baseline', '--expires-in', 'abc'], { config: SAMPLE_CONFIG, env });
				expect(base.exitCode).toBe(1);
				expect(stripAnsi(base.stderr)).toContain('must be an integer');
			},
			TIMEOUT,
		);

		test(
			'zero → exit 1',
			() => {
				const env = { MAAT_TEST_LEDGER: ledger.path };
				runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });

				const base = runCli(['baseline', '--expires-in', '0'], { config: SAMPLE_CONFIG, env });
				expect(base.exitCode).toBe(1);
				expect(stripAnsi(base.stderr)).toContain('at least 1');
			},
			TIMEOUT,
		);

		test(
			'above max (91) → exit 1',
			() => {
				const env = { MAAT_TEST_LEDGER: ledger.path };
				runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });

				const base = runCli(['baseline', '--expires-in', '91'], { config: SAMPLE_CONFIG, env });
				expect(base.exitCode).toBe(1);
				expect(stripAnsi(base.stderr)).toContain('at most 90');
			},
			TIMEOUT,
		);

		test(
			'negative value → exit 1',
			() => {
				const env = { MAAT_TEST_LEDGER: ledger.path };
				runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });

				const base = runCli(['baseline', '--expires-in', '-5'], { config: SAMPLE_CONFIG, env });
				expect(base.exitCode).toBe(1);
				expect(stripAnsi(base.stderr)).toContain('at least 1');
			},
			TIMEOUT,
		);

		test(
			'float value → exit 1',
			() => {
				const env = { MAAT_TEST_LEDGER: ledger.path };
				runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });

				const base = runCli(['baseline', '--expires-in', '7.5'], { config: SAMPLE_CONFIG, env });
				expect(base.exitCode).toBe(1);
				expect(stripAnsi(base.stderr)).toContain('must be an integer');
			},
			TIMEOUT,
		);
	});

	describe('expiresAt in ledger', () => {
		test(
			'default (no flag) → expiresAt ≈ now + 30 days',
			async () => {
				const env = { MAAT_TEST_LEDGER: ledger.path };
				runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });

				const before = Date.now();
				const base = runCli(['baseline'], { config: SAMPLE_CONFIG, env });
				const after = Date.now();
				expect(base.exitCode).toBe(0);

				const entries = await readLedgerEntries(ledger.path);
				const baselined = entries.filter((e) => e.type === 'finding.baselined');
				expect(baselined.length).toBeGreaterThan(0);

				const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
				for (const entry of baselined) {
					const expiresAt = new Date(entry.expiresAt as string).getTime();
					expect(expiresAt).toBeGreaterThanOrEqual(before + thirtyDaysMs - 2000);
					expect(expiresAt).toBeLessThanOrEqual(after + thirtyDaysMs + 2000);
				}
			},
			TIMEOUT,
		);

		test(
			'custom --expires-in 7 → expiresAt ≈ now + 7 days',
			async () => {
				const env = { MAAT_TEST_LEDGER: ledger.path };
				runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });

				const before = Date.now();
				const base = runCli(['baseline', '--expires-in', '7'], { config: SAMPLE_CONFIG, env });
				const after = Date.now();
				expect(base.exitCode).toBe(0);

				const entries = await readLedgerEntries(ledger.path);
				const baselined = entries.filter((e) => e.type === 'finding.baselined');
				expect(baselined.length).toBeGreaterThan(0);

				const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
				for (const entry of baselined) {
					const expiresAt = new Date(entry.expiresAt as string).getTime();
					expect(expiresAt).toBeGreaterThanOrEqual(before + sevenDaysMs - 2000);
					expect(expiresAt).toBeLessThanOrEqual(after + sevenDaysMs + 2000);
				}
			},
			TIMEOUT,
		);

		test(
			'all baselined findings share the same expiresAt',
			async () => {
				const env = { MAAT_TEST_LEDGER: ledger.path };
				runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });

				runCli(['baseline', '--expires-in', '15'], { config: SAMPLE_CONFIG, env });

				const entries = await readLedgerEntries(ledger.path);
				const baselined = entries.filter((e) => e.type === 'finding.baselined');
				expect(baselined.length).toBeGreaterThan(1);

				const expiresAtValues = new Set(baselined.map((e) => e.expiresAt));
				expect(expiresAtValues.size).toBe(1);
			},
			TIMEOUT,
		);

		test(
			'output date matches ledger expiresAt',
			async () => {
				const env = { MAAT_TEST_LEDGER: ledger.path };
				runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });

				const base = runCli(['baseline', '--expires-in', '10'], { config: SAMPLE_CONFIG, env });
				expect(base.exitCode).toBe(0);

				const entries = await readLedgerEntries(ledger.path);
				const baselined = entries.filter((e) => e.type === 'finding.baselined');
				expect(baselined.length).toBeGreaterThan(0);
				const ledgerDate = (baselined[0]?.expiresAt as string).slice(0, 10);

				expect(base.stdout).toContain(ledgerDate);
			},
			TIMEOUT,
		);
	});

	test(
		'empty ledger → nothing to baseline, exit 0',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const base = runCli(['baseline'], { config: SAMPLE_CONFIG, env });
			expect(base.exitCode).toBe(0);
			expect(base.stdout).toContain('Nothing to baseline');
		},
		TIMEOUT,
	);

	test(
		'second baseline is a no-op and does not change existing expiry',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			runCli(['baseline', '--expires-in', '7'], { config: SAMPLE_CONFIG, env });

			const firstEntries = await readLedgerEntries(ledger.path);
			const firstExpiries = firstEntries.filter((e) => e.type === 'finding.baselined').map((e) => e.expiresAt);
			expect(firstExpiries.length).toBeGreaterThan(0);

			const second = runCli(['baseline', '--expires-in', '60'], { config: SAMPLE_CONFIG, env });
			expect(second.exitCode).toBe(0);
			expect(second.stdout).toContain('Nothing to baseline');

			const secondEntries = await readLedgerEntries(ledger.path);
			const secondExpiries = secondEntries.filter((e) => e.type === 'finding.baselined').map((e) => e.expiresAt);
			expect(secondExpiries).toEqual(firstExpiries);
		},
		TIMEOUT,
	);

	test(
		'no ledger configured → exit 1',
		() => {
			const base = runCli(['baseline'], { config: SAMPLE_CONFIG, env: {} });
			expect(base.exitCode).toBe(1);
			expect(stripAnsi(base.stderr)).toContain('No ledger configured');
		},
		TIMEOUT,
	);

	test(
		'expired baseline → check exits 1 with expired warning',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			runCli(['baseline', '--expires-in', '1'], { config: SAMPLE_CONFIG, env });

			const content = await readFile(ledger.path, 'utf-8');
			const entries = content
				.trim()
				.split('\n')
				.filter(Boolean)
				.map((l) => JSON.parse(l));

			const baselined = entries.filter((e: RawLedgerEntry) => e.type === 'finding.baselined');
			expect(baselined.length).toBeGreaterThan(0);

			const expiredLines = entries.map((e: RawLedgerEntry) => {
				if (e.type === 'finding.baselined') {
					return JSON.stringify({ ...e, expiresAt: new Date(Date.now() - 1000).toISOString() });
				}
				return JSON.stringify(e);
			});
			await writeFile(ledger.path, `${expiredLines.join('\n')}\n`, 'utf-8');

			const check = runCli(['check'], { config: SAMPLE_CONFIG, env });
			expect(check.exitCode).toBe(1);
			expect(stripAnsi(check.stderr)).toContain('expired');
		},
		TIMEOUT,
	);
});
