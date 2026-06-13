import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import type { RuleOutput } from '@maat-tools/contracts';
import {
	LedgerHarness,
	runCli,
	scenarioBaselined,
	scenarioObserved,
	scenarioResolved,
	stripAnsi,
} from '@maat-tools/testing';

const SAMPLE_CONFIG = resolve(import.meta.dir, '../fixtures/sample-project/maat.config.ts');

const TIMEOUT = 30_000;

const FINDING_A: RuleOutput = {
	ruleId: 'test@v1',
	ruleIdentifier: { id: 'finding-a' },
	message: 'finding a',
	artifacts: [],
};

const FINDING_B: RuleOutput = {
	ruleId: 'test@v1',
	ruleIdentifier: { id: 'finding-b' },
	message: 'finding b',
	artifacts: [],
};

describe('maat visualize', () => {
	const ledger = new LedgerHarness();

	beforeEach(async () => await ledger.setup());
	afterEach(async () => await ledger.teardown());

	test(
		'exits 1 without a ledger configured',
		() => {
			const result = runCli(['visualize'], { config: SAMPLE_CONFIG });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('No ledger configured');
		},
		TIMEOUT,
	);

	test(
		'empty ledger → no-findings message',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('No findings or axioms');
		},
		TIMEOUT,
	);

	test(
		'observed finding → appears in OBSERVED section',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			await scenarioObserved(ledger, FINDING_A);

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(stripAnsi(result.stdout)).toContain('OBSERVED');
			expect(result.stdout).toContain(FINDING_A.message);
		},
		TIMEOUT,
	);

	test(
		'resolved finding → appears in RESOLVED section',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			await scenarioResolved(ledger, FINDING_A);

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(stripAnsi(result.stdout)).toContain('RESOLVED');
			expect(result.stdout).toContain(FINDING_A.message);
		},
		TIMEOUT,
	);

	test(
		'baselined finding → appears in BASELINED section',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			await scenarioBaselined(ledger, FINDING_A);

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(stripAnsi(result.stdout)).toContain('BASELINED');
			expect(result.stdout).toContain(FINDING_A.message);
		},
		TIMEOUT,
	);

	test(
		'--filter observed → only observed group shown',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			await scenarioObserved(ledger, FINDING_A);
			await scenarioResolved(ledger, FINDING_B);

			const result = runCli(['visualize', '--filter', 'observed'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(stripAnsi(result.stdout)).toContain('OBSERVED');
			expect(stripAnsi(result.stdout)).not.toContain('RESOLVED');
		},
		TIMEOUT,
	);

	test(
		'declared axiom → shown in AXIOMS section by default',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			runCli(['axiom', 'declare', '--id', 'ax-001', '--scope', 'kernel', '--claim', 'Kernel is pure'], {
				config: SAMPLE_CONFIG,
				env,
			});

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(stripAnsi(result.stdout)).toContain('AXIOMS');
			expect(result.stdout).toContain('Kernel is pure');
		},
		TIMEOUT,
	);

	test(
		'--no-axioms → axioms section suppressed',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			runCli(['axiom', 'declare', '--id', 'ax-001', '--scope', 'kernel', '--claim', 'Kernel is pure'], {
				config: SAMPLE_CONFIG,
				env,
			});

			const result = runCli(['visualize', '--no-axioms'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(stripAnsi(result.stdout)).not.toContain('AXIOMS');
		},
		TIMEOUT,
	);

	test(
		'--json → valid JSON output with grouped findings',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			await scenarioObserved(ledger, FINDING_A);
			await scenarioResolved(ledger, FINDING_B);

			const result = runCli(['visualize', '--json'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			const output = JSON.parse(result.stdout) as { findings: { observed: unknown[]; resolved: unknown[] } };
			expect(output.findings.observed).toHaveLength(1);
			expect(output.findings.resolved).toHaveLength(1);
		},
		TIMEOUT,
	);

	test(
		'--json --no-axioms → axioms key absent from JSON',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			await scenarioObserved(ledger, FINDING_A);

			const result = runCli(['visualize', '--json', '--no-axioms'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			const output = JSON.parse(result.stdout) as Record<string, unknown>;
			expect('axioms' in output).toBe(false);
		},
		TIMEOUT,
	);
});
