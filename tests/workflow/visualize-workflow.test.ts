import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { FindingRuleOutput } from '@maat-tools/contracts';
import type { MaatConfig } from '@maat-tools/core';
import { Kernel } from '@maat-tools/kernel';
import {
	ConsoleCapture,
	ExitCapture,
	LedgerHarness,
	scenarioBaselined,
	scenarioObserved,
	scenarioResolved,
} from '@maat-tools/testing';
import { Command } from 'commander';
import { Visualize } from '../../packages/cli/src/commands/visualize';
import { StdoutPresenter } from '@maat-tools/utils';

const BASE_CONFIG: MaatConfig = { collectors: [], rules: [] };

const FINDING_A: FindingRuleOutput = {
	ruleId: 'test@v1',
	ruleIdentifier: { id: 'finding-a' },
	message: 'finding a',
	artifacts: [],
};

const FINDING_B: FindingRuleOutput = {
	ruleId: 'test@v1',
	ruleIdentifier: { id: 'finding-b' },
	message: 'finding b',
	artifacts: [],
};

function buildVisualize(ledger: LedgerHarness | null) {
	return new Visualize(new Command(), BASE_CONFIG, new Kernel(), [], new StdoutPresenter(), ledger?.backend ?? null);
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

describe('visualize', () => {
	test('no ledger → exit 1', async () => {
		await expect(buildVisualize(null).action({})).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
		expect(capture.stderr).toContain('No ledger configured');
	});

	test('empty ledger → no-findings message', async () => {
		await buildVisualize(ledger).action({});
		exit.assertNotExited();
		expect(capture.stdout).toContain('No findings or axioms');
	});

	test('observed finding → appears in OBSERVED section', async () => {
		await scenarioObserved(ledger, FINDING_A);
		await buildVisualize(ledger).action({});
		exit.assertNotExited();
		expect(capture.plainText()).toContain('OBSERVED');
		expect(capture.stdout).toContain(FINDING_A.message);
	});

	test('resolved finding → appears in RESOLVED section', async () => {
		await scenarioResolved(ledger, FINDING_A);
		await buildVisualize(ledger).action({});
		exit.assertNotExited();
		expect(capture.plainText()).toContain('RESOLVED');
		expect(capture.stdout).toContain(FINDING_A.message);
	});

	test('baselined finding → appears in BASELINED section', async () => {
		await scenarioBaselined(ledger, FINDING_A);
		await buildVisualize(ledger).action({});
		exit.assertNotExited();
		expect(capture.plainText()).toContain('BASELINED');
		expect(capture.stdout).toContain(FINDING_A.message);
	});

	test('--filter observed → only observed group shown', async () => {
		await scenarioObserved(ledger, FINDING_A);
		await scenarioResolved(ledger, FINDING_B);
		await buildVisualize(ledger).action({ filter: 'observed' });
		exit.assertNotExited();
		expect(capture.plainText()).toContain('OBSERVED');
		expect(capture.plainText()).not.toContain('RESOLVED');
	});

	test('axiom present → shown in AXIOMS section by default', async () => {
		await ledger.backend.append({
			type: 'axiom.declared',
			timestamp: new Date().toISOString(),
			axiom_id: 'ax-001',
			scope: 'kernel',
			claim: 'Kernel is pure',
		});
		await buildVisualize(ledger).action({});
		exit.assertNotExited();
		expect(capture.plainText()).toContain('AXIOMS');
		expect(capture.stdout).toContain('Kernel is pure');
	});

	test('--no-axioms → axioms section suppressed', async () => {
		await ledger.backend.append({
			type: 'axiom.declared',
			timestamp: new Date().toISOString(),
			axiom_id: 'ax-001',
			scope: 'kernel',
			claim: 'Kernel is pure',
		});
		await buildVisualize(ledger).action({ axioms: false });
		exit.assertNotExited();
		expect(capture.plainText()).not.toContain('AXIOMS');
	});

	test('--json → valid JSON output with grouped findings', async () => {
		await scenarioObserved(ledger, FINDING_A);
		await scenarioResolved(ledger, FINDING_B);
		await buildVisualize(ledger).action({ json: true });
		exit.assertNotExited();
		const output = JSON.parse(capture.stdout) as { findings: { observed: unknown[]; resolved: unknown[] } };
		expect(output.findings.observed).toHaveLength(1);
		expect(output.findings.resolved).toHaveLength(1);
	});

	test('--json --no-axioms → axioms key absent from JSON', async () => {
		await scenarioObserved(ledger, FINDING_A);
		await buildVisualize(ledger).action({ json: true, axioms: false });
		exit.assertNotExited();
		const output = JSON.parse(capture.stdout) as Record<string, unknown>;
		expect('axioms' in output).toBe(false);
	});
});
