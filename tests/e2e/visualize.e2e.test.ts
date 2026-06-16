import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import type { RuleOutput } from '@maat-tools/contracts';
import {
	LedgerHarness,
	runCli,
	scenarioBaselined,
	scenarioObserved,
	scenarioResolved,
	scenarioRevoked,
	scenarioUnverified,
	stripAnsi,
} from '@maat-tools/testing';

const SAMPLE_CONFIG = resolve(import.meta.dir, '../fixtures/sample-project/maat.config.ts');
const INSIGHTS_CONFIG = resolve(import.meta.dir, '../fixtures/sample-project/maat.config.visualize-insights.ts');

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

const FINDING_C: RuleOutput = {
	ruleId: 'other@v1',
	ruleIdentifier: { id: 'finding-c' },
	message: 'finding c',
	artifacts: [],
};

function envFor(ledger: LedgerHarness): Record<string, string> {
	return { MAAT_TEST_LEDGER: ledger.path };
}

function declareAxiom(ledger: LedgerHarness) {
	return runCli(['axiom', 'declare', '--id', 'ax-001', '--scope', 'kernel', '--claim', 'Kernel is pure'], {
		config: SAMPLE_CONFIG,
		env: envFor(ledger),
	});
}

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
			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			expect(stripAnsi(result.stdout)).toContain('No findings or axioms in the ledger.');
		},
		TIMEOUT,
	);

	test(
		'observed finding → appears in OBSERVED section',
		async () => {
			await scenarioObserved(ledger, FINDING_A);

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const stdout = stripAnsi(result.stdout);
			expect(stdout).toContain('OBSERVED (1)');
			expect(stdout).toContain(FINDING_A.message);
		},
		TIMEOUT,
	);

	test(
		'resolved finding → appears in RESOLVED section',
		async () => {
			await scenarioResolved(ledger, FINDING_A);

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const stdout = stripAnsi(result.stdout);
			expect(stdout).toContain('RESOLVED (1)');
			expect(stdout).toContain(FINDING_A.message);
		},
		TIMEOUT,
	);

	test(
		'baselined finding → appears in BASELINED section',
		async () => {
			await scenarioBaselined(ledger, FINDING_A);

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const stdout = stripAnsi(result.stdout);
			expect(stdout).toContain('BASELINED (1)');
			expect(stdout).toContain(FINDING_A.message);
		},
		TIMEOUT,
	);

	test(
		'unverified finding → appears in UNVERIFIED section with verification badge',
		async () => {
			await scenarioUnverified(ledger, FINDING_A);

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const stdout = stripAnsi(result.stdout);
			expect(stdout).toContain('UNVERIFIED (1)');
			expect(stdout).toContain(FINDING_A.message);
			expect(stdout).toContain('[Verify]');
		},
		TIMEOUT,
	);

	test(
		'revoked finding → appears in REVOKED section',
		async () => {
			await scenarioRevoked(ledger, FINDING_A);

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const stdout = stripAnsi(result.stdout);
			expect(stdout).toContain('REVOKED (1)');
			expect(stdout).toContain(FINDING_A.message);
		},
		TIMEOUT,
	);

	test(
		'multiple findings in one group → counted together',
		async () => {
			await scenarioObserved(ledger, FINDING_A);
			await scenarioObserved(ledger, FINDING_B);

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			expect(stripAnsi(result.stdout)).toContain('OBSERVED (2)');
		},
		TIMEOUT,
	);

	test(
		'findings are grouped by rule in text output',
		async () => {
			await scenarioObserved(ledger, FINDING_A);
			await scenarioObserved(ledger, FINDING_B);
			await scenarioObserved(ledger, FINDING_C);

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const stdout = stripAnsi(result.stdout);
			expect(stdout).toContain('[test@v1] — 2 finding(s)');
			expect(stdout).toContain('[other@v1] — 1 finding');
		},
		TIMEOUT,
	);

	test(
		'empty groups are omitted from text output',
		async () => {
			await scenarioObserved(ledger, FINDING_A);

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const stdout = stripAnsi(result.stdout);
			expect(stdout).toContain('OBSERVED (1)');
			expect(stdout).not.toContain('RESOLVED');
			expect(stdout).not.toContain('BASELINED');
			expect(stdout).not.toContain('UNVERIFIED');
			expect(stdout).not.toContain('REVOKED');
		},
		TIMEOUT,
	);

	test(
		'--filter observed → only observed group shown',
		async () => {
			await scenarioObserved(ledger, FINDING_A);
			await scenarioResolved(ledger, FINDING_B);

			const result = runCli(['visualize', '--filter', 'observed'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const stdout = stripAnsi(result.stdout);
			expect(stdout).toContain('OBSERVED (1)');
			expect(stdout).not.toContain('RESOLVED');
			expect(stdout).not.toContain('BASELINED');
			expect(stdout).not.toContain('UNVERIFIED');
			expect(stdout).not.toContain('REVOKED');
		},
		TIMEOUT,
	);

	test(
		'--filter observed,resolved → shows both groups, hides others',
		async () => {
			await scenarioObserved(ledger, FINDING_A);
			await scenarioResolved(ledger, FINDING_B);
			await scenarioBaselined(ledger, FINDING_C);

			const result = runCli(['visualize', '--filter', 'observed,resolved'], {
				config: SAMPLE_CONFIG,
				env: envFor(ledger),
			});
			expect(result.exitCode).toBe(0);
			const stdout = stripAnsi(result.stdout);
			expect(stdout).toContain('OBSERVED (1)');
			expect(stdout).toContain('RESOLVED (1)');
			expect(stdout).not.toContain('BASELINED');
			expect(stdout).not.toContain('UNVERIFIED');
			expect(stdout).not.toContain('REVOKED');
		},
		TIMEOUT,
	);

	test(
		'--filter trims whitespace around group names',
		async () => {
			await scenarioObserved(ledger, FINDING_A);
			await scenarioResolved(ledger, FINDING_B);

			const result = runCli(['visualize', '--filter', ' observed , resolved '], {
				config: SAMPLE_CONFIG,
				env: envFor(ledger),
			});
			expect(result.exitCode).toBe(0);
			const stdout = stripAnsi(result.stdout);
			expect(stdout).toContain('OBSERVED (1)');
			expect(stdout).toContain('RESOLVED (1)');
		},
		TIMEOUT,
	);

	test(
		'invalid --filter value → exits 1 with usage hint',
		() => {
			const result = runCli(['visualize', '--filter', 'unknown'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(1);
			const stderr = stripAnsi(result.stderr);
			expect(stderr).toContain('Invalid group "unknown"');
			expect(stderr).toContain('observed, baselined, resolved, unverified, revoked');
		},
		TIMEOUT,
	);

	test(
		'--filter that excludes all findings still shows axioms',
		async () => {
			await scenarioObserved(ledger, FINDING_A);
			declareAxiom(ledger);

			const result = runCli(['visualize', '--filter', 'resolved'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const stdout = stripAnsi(result.stdout);
			expect(stdout).not.toContain('OBSERVED');
			expect(stdout).toContain('AXIOMS (1)');
		},
		TIMEOUT,
	);

	test(
		'declared axiom → shown in AXIOMS section by default',
		() => {
			declareAxiom(ledger);

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const stdout = stripAnsi(result.stdout);
			expect(stdout).toContain('AXIOMS (1)');
			expect(stdout).toContain('Kernel is pure');
		},
		TIMEOUT,
	);

	test(
		'revoked axioms are shown and labelled with their status and reason',
		() => {
			declareAxiom(ledger);
			const revokeResult = runCli(['axiom', 'revoke', '--id', 'ax-001', '--reason', 'no longer valid'], {
				config: SAMPLE_CONFIG,
				env: envFor(ledger),
			});
			expect(revokeResult.exitCode).toBe(0);

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const stdout = stripAnsi(result.stdout);
			expect(stdout).toContain('AXIOMS (1)');
			expect(stdout).toContain('ax-001');
			expect(stdout).toContain('status: revoked');
			expect(stdout).toContain('reason: no longer valid');
		},
		TIMEOUT,
	);

	test(
		'superseded and active axioms are both shown with their respective statuses',
		() => {
			declareAxiom(ledger);
			runCli(['axiom', 'declare', '--id', 'ax-002', '--scope', 'kernel', '--claim', 'Kernel is pure v2'], {
				config: SAMPLE_CONFIG,
				env: envFor(ledger),
			});
			const supersedeResult = runCli(['axiom', 'supersede', '--id', 'ax-001', '--reason', 'replaced by ax-002'], {
				config: SAMPLE_CONFIG,
				env: envFor(ledger),
			});
			expect(supersedeResult.exitCode).toBe(0);

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const stdout = stripAnsi(result.stdout);
			expect(stdout).toContain('AXIOMS (2)');
			expect(stdout).toContain('ax-001');
			expect(stdout).toContain('status: superseded');
			expect(stdout).toContain('reason: replaced by ax-002');
			expect(stdout).toContain('ax-002');
			expect(stdout).toContain('status: active');
		},
		TIMEOUT,
	);

	test(
		'--no-axioms → axioms section suppressed',
		() => {
			declareAxiom(ledger);

			const result = runCli(['visualize', '--no-axioms'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			expect(stripAnsi(result.stdout)).not.toContain('AXIOMS');
		},
		TIMEOUT,
	);

	test(
		'--no-axioms with only axioms → empty ledger message',
		() => {
			declareAxiom(ledger);

			const result = runCli(['visualize', '--no-axioms'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			expect(stripAnsi(result.stdout)).toContain('No findings or axioms in the ledger.');
		},
		TIMEOUT,
	);

	test(
		'active axioms prevent the empty-ledger message even with no findings',
		() => {
			declareAxiom(ledger);

			const result = runCli(['visualize'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const stdout = stripAnsi(result.stdout);
			expect(stdout).toContain('AXIOMS (1)');
			expect(stdout).not.toContain('No findings or axioms');
		},
		TIMEOUT,
	);

	test(
		'--json → valid JSON output with grouped findings',
		async () => {
			await scenarioObserved(ledger, FINDING_A);
			await scenarioResolved(ledger, FINDING_B);

			const result = runCli(['visualize', '--json'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const output = JSON.parse(result.stdout) as {
				findings: { observed: unknown[]; resolved: unknown[] };
				axioms: unknown[];
			};
			expect(output.findings.observed).toHaveLength(1);
			expect(output.findings.resolved).toHaveLength(1);
			expect(output.axioms).toEqual([]);
		},
		TIMEOUT,
	);

	test(
		'--json preserves requiresVerification for unverified findings',
		async () => {
			await scenarioUnverified(ledger, FINDING_A);

			const result = runCli(['visualize', '--json'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const output = JSON.parse(result.stdout) as {
				findings: { unverified: Array<{ requiresVerification: boolean }> };
			};
			expect(output.findings.unverified).toHaveLength(1);
			expect(output.findings.unverified[0]?.requiresVerification).toBe(true);
		},
		TIMEOUT,
	);

	test(
		'--json includes active axioms by default',
		async () => {
			await scenarioObserved(ledger, FINDING_A);
			declareAxiom(ledger);

			const result = runCli(['visualize', '--json'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const output = JSON.parse(result.stdout) as { findings: Record<string, unknown>; axioms: unknown[] };
			expect(output.axioms).toHaveLength(1);
			expect((output.axioms[0] as Record<string, unknown>).axiomId).toBe('ax-001');
		},
		TIMEOUT,
	);

	test(
		'--json --no-axioms → axioms key absent from JSON',
		async () => {
			await scenarioObserved(ledger, FINDING_A);
			declareAxiom(ledger);

			const result = runCli(['visualize', '--json', '--no-axioms'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const output = JSON.parse(result.stdout) as Record<string, unknown>;
			expect('axioms' in output).toBe(false);
		},
		TIMEOUT,
	);

	test(
		'--json --filter → only requested finding groups',
		async () => {
			await scenarioObserved(ledger, FINDING_A);
			await scenarioResolved(ledger, FINDING_B);

			const result = runCli(['visualize', '--json', '--filter', 'observed'], {
				config: SAMPLE_CONFIG,
				env: envFor(ledger),
			});
			expect(result.exitCode).toBe(0);
			const output = JSON.parse(result.stdout) as { findings: { observed: unknown[]; resolved?: unknown[] } };
			expect(output.findings.observed).toHaveLength(1);
			expect(output.findings.resolved).toBeUndefined();
		},
		TIMEOUT,
	);

	test(
		'--insights with no insights configured → no insights section',
		async () => {
			await scenarioObserved(ledger, FINDING_A);

			const result = runCli(['visualize', '--insights'], { config: SAMPLE_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			expect(stripAnsi(result.stdout)).not.toContain('INSIGHTS');
		},
		TIMEOUT,
	);

	test(
		'--insights with matching findings → INSIGHTS section shown',
		async () => {
			await scenarioObserved(ledger, FINDING_A);

			const result = runCli(['visualize', '--insights'], { config: INSIGHTS_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const stdout = stripAnsi(result.stdout);
			expect(stdout).toContain('INSIGHTS (1)');
			expect(stdout).toContain('test/echo@v1');
			expect(stdout).toContain('1 finding(s) observed');
		},
		TIMEOUT,
	);

	test(
		'--json --insights includes insights array',
		async () => {
			await scenarioObserved(ledger, FINDING_A);

			const result = runCli(['visualize', '--json', '--insights'], { config: INSIGHTS_CONFIG, env: envFor(ledger) });
			expect(result.exitCode).toBe(0);
			const output = JSON.parse(result.stdout) as { insights: Array<{ insightId: string }> };
			expect(output.insights).toHaveLength(1);
			expect(output.insights[0]?.insightId).toBe('test/echo@v1');
		},
		TIMEOUT,
	);
});
