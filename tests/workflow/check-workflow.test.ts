import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { FindingRuleOutput } from '@maat-tools/contracts';
import { generateFingerprint } from '@maat-tools/contracts';
import type { MaatConfig } from '@maat-tools/core';
import { Kernel } from '@maat-tools/kernel';
import {
	ConsoleCapture,
	ExitCapture,
	LedgerHarness,
	makeCollector,
	makeEnricher,
	scenarioBaselined,
	scenarioResolved,
} from '@maat-tools/testing';
import { Command } from 'commander';
import { Check } from '../../packages/cli/src/commands/check';
import { StdoutPresenter } from '@maat-tools/utils';

const RULE_OUTPUT: FindingRuleOutput = {
	ruleId: 'test@v1',
	ruleIdentifier: { id: 'test-finding' },
	message: 'test finding',
	artifacts: [],
};

const BASE_CONFIG: MaatConfig = { collectors: [], rules: [] };
const STRICT_CONFIG: MaatConfig = { collectors: [], rules: [], check: { strict: true } };

function buildKernel(findings: FindingRuleOutput[] = []) {
	const kernel = new Kernel();
	kernel.registerCollector(makeCollector([]));
	kernel.registerRule({
		instanceId: 'test@v1',
		id: 'test@v1',
		needFacts: ['testFacts'] as const,
		evaluate: () => findings,
		describeArtifact: (artifact) => ({ value: String(artifact.data) }),
	});
	return kernel;
}

function buildProbabilisticKernel() {
	const kernel = new Kernel();
	kernel.registerCollector(makeCollector(['x']));
	kernel.registerEnricher(makeEnricher());
	kernel.registerRule({
		instanceId: 'prob@v1',
		id: 'prob@v1',
		needFacts: ['enrichedFacts'] as const,
		evaluate: ({ enrichedFacts }) =>
			enrichedFacts.map((v, i) => ({
				ruleId: 'prob@v1',
				ruleIdentifier: { v, i },
				message: `probabilistic: ${v}`,
				artifacts: [],
			})),
		describeArtifact: (a) => ({ value: String(a.data) }),
	});
	return kernel;
}

function buildCheck(findings: FindingRuleOutput[], ledger: LedgerHarness | null, config: MaatConfig = BASE_CONFIG) {
	return new Check(new Command(), config, buildKernel(findings), [], new StdoutPresenter(), ledger?.backend ?? null);
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

describe('check — no ledger', () => {
	test('no findings → no exit, run context in output', async () => {
		await buildCheck([], null).action({});
		exit.assertNotExited();
		expect(capture.plainText()).toContain('RUN CONTEXT');
		expect(capture.plainText()).toContain('Ledger: not configured');
	});

	test('findings present, non-strict → no exit', async () => {
		await buildCheck([RULE_OUTPUT], null).action({ silent: true });
		exit.assertNotExited();
	});

	test('findings present, strict → exit 1', async () => {
		await expect(buildCheck([RULE_OUTPUT], null, STRICT_CONFIG).action({ silent: true })).rejects.toThrow(
			'process.exit',
		);
		exit.assertExitedWith(1);
	});

	test('only probabilistic findings, strict → no exit', async () => {
		const check = new Check(new Command(), STRICT_CONFIG, buildProbabilisticKernel(), [], new StdoutPresenter(), null);
		await check.action({ silent: true });
		exit.assertNotExited();
	});

	test('--ledger flag without ledger configured → exit 1 with error', async () => {
		await expect(buildCheck([], null).action({ ledger: true })).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
		expect(capture.stderr).toContain('Ledger option enabled');
	});

	test('--show findings → run context not in output', async () => {
		await buildCheck([], null).action({ show: 'findings' });
		expect(capture.plainText()).not.toContain('RUN CONTEXT');
	});

	test('--show insights → findings section not in output', async () => {
		await buildCheck([RULE_OUTPUT], null).action({ show: 'insights' });
		expect(capture.plainText()).not.toContain('FINDINGS');
	});
});

describe('check — with ledger', () => {
	test('check --ledger writes new findings as OBSERVED to the ledger', async () => {
		await expect(
			buildCheck([RULE_OUTPUT], ledger, STRICT_CONFIG).action({ ledger: true, silent: true }),
		).rejects.toThrow('process.exit');

		const record = await ledger.backend.getFindingByFingerprint(
			generateFingerprint(RULE_OUTPUT.ruleId, RULE_OUTPUT.ruleIdentifier),
		);
		expect(record).not.toBeNull();
		expect(record?.state).toBe('finding.observed');
	});

	test('active baselined finding → hidden, strict mode does not exit', async () => {
		await scenarioBaselined(ledger, RULE_OUTPUT);
		await buildCheck([RULE_OUTPUT], ledger, STRICT_CONFIG).action({ silent: true });
		exit.assertNotExited();
	});

	test('expired baseline → finding visible, exits 1 regardless of strict', async () => {
		await scenarioBaselined(ledger, RULE_OUTPUT, -1);
		await expect(buildCheck([RULE_OUTPUT], ledger).action({ silent: true })).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
	});

	test('finding re-appears after resolved → regression, exits 1', async () => {
		await scenarioResolved(ledger, RULE_OUTPUT);
		await expect(buildCheck([RULE_OUTPUT], ledger).action({ silent: true })).rejects.toThrow('process.exit');
		exit.assertExitedWith(1);
	});

	test('finding fingerprint matches across kernel and ledger scenario', async () => {
		const fp = await scenarioBaselined(ledger, RULE_OUTPUT);
		expect(fp).toBe(generateFingerprint(RULE_OUTPUT.ruleId, RULE_OUTPUT.ruleIdentifier));
	});
});
