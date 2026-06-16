import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { FindingStatus } from '@maat-tools/contracts';
import { LedgerHarness } from '@maat-tools/testing';
import { FilePathLedgerBackend } from './index';

const OBSERVED = {
	type: FindingStatus.OBSERVED,
	timestamp: new Date().toISOString(),
	fingerprint: 'fp1',
	ruleId: 'rule@v1',
	instanceId: 'rule@v1',
	message: 'test finding',
	artifacts: [],
} as const;

const OBSERVED_2 = {
	type: FindingStatus.OBSERVED,
	timestamp: new Date().toISOString(),
	fingerprint: 'fp2',
	ruleId: 'rule@v1',
	instanceId: 'rule@v1',
	message: 'second finding',
	artifacts: [],
} as const;

const BASELINE_EXPIRES = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const BASELINED = {
	type: FindingStatus.BASELINED,
	timestamp: new Date().toISOString(),
	fingerprint: 'fp1',
	ruleId: 'rule@v1',
	instanceId: 'rule@v1',
	message: 'test finding',
	artifacts: [],
	expiresAt: BASELINE_EXPIRES,
} as const;

const RESOLVED = {
	type: FindingStatus.RESOLVED,
	timestamp: new Date().toISOString(),
	fingerprint: 'fp1',
	ruleId: 'rule@v1',
	instanceId: 'rule@v1',
	message: 'test finding',
	artifacts: [],
} as const;

const harness = new LedgerHarness();

beforeEach(() => harness.setup());
afterEach(() => harness.teardown());

describe('construction', () => {
	test('throws when path does not end with .ndjson', () => {
		expect(() => new FilePathLedgerBackend({ path: '/tmp/ledger.json' })).toThrow('path must end with ".ndjson"');
		expect(() => new FilePathLedgerBackend({ path: '/tmp/ledger' })).toThrow('path must end with ".ndjson"');
	});
});

describe('not-initialized guards', () => {
	function uninit() {
		return new FilePathLedgerBackend({ path: harness.path });
	}

	test('append throws', async () => {
		await expect(uninit().append(OBSERVED)).rejects.toThrow('not initialized');
	});

	test('getAxiomByFingerprint throws', async () => {
		await expect(uninit().getAxiomByFingerprint('fp1')).rejects.toThrow('not initialized');
	});

	test('getFindingByFingerprint throws', async () => {
		await expect(uninit().getFindingByFingerprint('fp1')).rejects.toThrow('not initialized');
	});

	test('getNotBaselinedFindings throws', async () => {
		await expect(uninit().getNotBaselinedFindingsState()).rejects.toThrow('not initialized');
	});

	test('getAllAxioms throws', async () => {
		await expect(uninit().getAllAxiomsState()).rejects.toThrow('not initialized');
	});

	test('getAllFindings throws', async () => {
		await expect(uninit().getAllFindingsState()).rejects.toThrow('not initialized');
	});
});

describe('lifecycle', () => {
	test('fresh ledger has no findings and no axioms', async () => {
		expect(await harness.backend.getAllFindingsState()).toEqual([]);
		expect(await harness.backend.getAllAxiomsState()).toEqual([]);
	});

	test('initialize twice throws', async () => {
		await expect(harness.backend.initialize()).rejects.toThrow('already initialized');
	});
});

describe('append reflects immediately', () => {
	test('finding is visible via getFindingByFingerprint right after append', async () => {
		await harness.backend.append(OBSERVED);
		const record = await harness.backend.getFindingByFingerprint('fp1');
		expect(record).not.toBeNull();
		expect(record?.ruleId).toBe('rule@v1');
		expect(record?.message).toBe('test finding');
		expect(record?.type).toBe(FindingStatus.OBSERVED);
	});

	test('second event on the same fingerprint is reflected without re-initialize', async () => {
		await harness.backend.append(OBSERVED);
		await harness.backend.append(BASELINED);
		const record = await harness.backend.getFindingByFingerprint('fp1');
		expect(record?.type).toBe(FindingStatus.BASELINED);
		expect(record?.type === FindingStatus.BASELINED && record.expiresAt).toBe(BASELINE_EXPIRES);
	});

	test('append generates and persists entryId automatically', async () => {
		await harness.backend.append(OBSERVED);
		const line = (await Bun.file(harness.path).text()).trim();
		const event = JSON.parse(line) as { entryId: string };
		expect(typeof event.entryId).toBe('string');
		expect(event.entryId.length).toBeGreaterThan(0);
	});
});

describe('finding states', () => {
	test('observed finding has correct fields', async () => {
		await harness.backend.append(OBSERVED);
		const record = await harness.backend.getFindingByFingerprint('fp1');
		expect(record?.type).toBe(FindingStatus.OBSERVED);
		expect(record?.artifacts).toEqual([]);
	});

	test('baselined finding is the latest event with expiry', async () => {
		await harness.backend.append(OBSERVED);
		await harness.backend.append(BASELINED);
		const record = await harness.backend.getFindingByFingerprint('fp1');
		expect(record?.type).toBe(FindingStatus.BASELINED);
		expect(record?.type === FindingStatus.BASELINED && record.expiresAt).toBe(BASELINE_EXPIRES);
	});

	test('resolved finding reflects state', async () => {
		await harness.backend.append(OBSERVED);
		await harness.backend.append(RESOLVED);
		const record = await harness.backend.getFindingByFingerprint('fp1');
		expect(record?.type).toBe(FindingStatus.RESOLVED);
	});

	test('getNotBaselinedFindings excludes baselined findings', async () => {
		await harness.backend.append(OBSERVED);
		await harness.backend.append(OBSERVED_2);
		await harness.backend.append(BASELINED);
		const results = await harness.backend.getNotBaselinedFindingsState();
		expect(results).toHaveLength(1);
		expect(results[0]?.fingerprint).toBe('fp2');
	});

	test('re-observing a finding under a non-expired baseline is rejected', async () => {
		await harness.backend.append(OBSERVED);
		await harness.backend.append(BASELINED);
		await expect(harness.backend.append(OBSERVED)).rejects.toThrow('invalid transition');
		const record = await harness.backend.getFindingByFingerprint('fp1');
		expect(record?.type).toBe(FindingStatus.BASELINED);
	});

	test('re-observing a finding after the baseline expired is allowed', async () => {
		await harness.backend.append(OBSERVED);
		await harness.backend.append({
			...BASELINED,
			expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
		});
		await harness.backend.append(OBSERVED);
		const record = await harness.backend.getFindingByFingerprint('fp1');
		expect(record?.type).toBe(FindingStatus.OBSERVED);
	});

	test('getNotBaselinedFindings includes expired baselines', async () => {
		await harness.backend.append(OBSERVED);
		await harness.backend.append({
			...BASELINED,
			expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
		});
		const results = await harness.backend.getNotBaselinedFindingsState();
		expect(results).toHaveLength(1);
		expect(results[0]?.fingerprint).toBe('fp1');
	});
});

describe('axiom states', () => {
	const AXIOM_ID = 'axiom-001';

	test('declared axiom appears in getAllAxioms', async () => {
		await harness.backend.append({
			type: FindingStatus.AXIOM_DECLARED,
			timestamp: new Date().toISOString(),
			axiomId: AXIOM_ID,
			scope: 'kernel',
			claim: 'Kernel is always pure',
		});
		const axioms = await harness.backend.getAllAxiomsState();
		expect(axioms).toHaveLength(1);
		expect(axioms[0]?.axiomId).toBe(AXIOM_ID);
		expect(axioms[0]?.type).toBe(FindingStatus.AXIOM_DECLARED);
		expect(axioms[0]?.claim).toBe('Kernel is always pure');
	});

	test('revoked axiom keeps its declaration data', async () => {
		await harness.backend.append({
			type: FindingStatus.AXIOM_DECLARED,
			timestamp: new Date().toISOString(),
			axiomId: AXIOM_ID,
			scope: 'kernel',
			claim: 'Kernel is always pure',
		});
		await harness.backend.append({
			type: FindingStatus.AXIOM_REVOKED,
			timestamp: new Date().toISOString(),
			axiomId: AXIOM_ID,
			reason: 'No longer applies',
			scope: 'kernel',
			claim: 'Kernel is always pure',
		});
		const axiom = await harness.backend.getAxiomByFingerprint(AXIOM_ID);
		expect(axiom?.type).toBe(FindingStatus.AXIOM_REVOKED);
		expect(axiom?.claim).toBe('Kernel is always pure');
	});
});

describe('NDJSON round-trip', () => {
	test('new backend instance reads state written by another instance', async () => {
		await harness.backend.append(OBSERVED);
		await harness.backend.append(RESOLVED);

		const fresh = new FilePathLedgerBackend({ path: harness.path });
		await fresh.initialize();

		const findings = await fresh.getAllFindingsState();
		expect(findings).toHaveLength(1);
		expect(findings[0]?.type).toBe(FindingStatus.RESOLVED);
	});
});
