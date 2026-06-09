import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { FindingStatus } from '@maat-tools/contracts';
import { LedgerHarness } from '@maat-tools/testing';
import { FilePathLedgerBackend } from './index';

const OBSERVED = {
	type: FindingStatus.OBSERVED,
	timestamp: new Date().toISOString(),
	fingerprint: 'fp1',
	rule_id: 'rule@v1',
	instance_id: 'rule@v1',
	message: 'test finding',
	artifacts: [],
} as const;

const OBSERVED_2 = {
	type: FindingStatus.OBSERVED,
	timestamp: new Date().toISOString(),
	fingerprint: 'fp2',
	rule_id: 'rule@v1',
	instance_id: 'rule@v1',
	message: 'second finding',
	artifacts: [],
} as const;

const BASELINE_EXPIRES = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

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
		await expect(uninit().getNotBaselinedFindings()).rejects.toThrow('not initialized');
	});

	test('getAllAxioms throws', async () => {
		await expect(uninit().getAllAxioms()).rejects.toThrow('not initialized');
	});

	test('getAllFindings throws', async () => {
		await expect(uninit().getAllFindings()).rejects.toThrow('not initialized');
	});
});

describe('lifecycle', () => {
	test('fresh ledger has no findings and no axioms', async () => {
		expect(await harness.backend.getAllFindings()).toEqual([]);
		expect(await harness.backend.getAllAxioms()).toEqual([]);
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
		expect(record?.rule_id).toBe('rule@v1');
		expect(record?.message).toBe('test finding');
		expect(record?.state).toBe(FindingStatus.OBSERVED);
	});

	test('second event on the same fingerprint is reflected without re-initialize', async () => {
		await harness.backend.append(OBSERVED);
		await harness.backend.append({
			type: FindingStatus.BASELINED,
			timestamp: new Date().toISOString(),
			fingerprint: 'fp1',
			expires_at: BASELINE_EXPIRES,
		});
		const record = await harness.backend.getFindingByFingerprint('fp1');
		expect(record?.baselined).toBe(true);
		expect(record?.baseline_expires_at).toBe(BASELINE_EXPIRES);
	});

	test('append generates and persists entry_id automatically', async () => {
		await harness.backend.append(OBSERVED);
		const line = (await Bun.file(harness.path).text()).trim();
		const event = JSON.parse(line) as { entry_id: string };
		expect(typeof event.entry_id).toBe('string');
		expect(event.entry_id.length).toBeGreaterThan(0);
	});
});

describe('finding states', () => {
	test('observed finding has correct fields', async () => {
		await harness.backend.append(OBSERVED);
		const record = await harness.backend.getFindingByFingerprint('fp1');
		expect(record?.state).toBe(FindingStatus.OBSERVED);
		expect(record?.baselined).toBe(false);
		expect(record?.artifacts).toEqual([]);
	});

	test('baselined finding is marked baselined with expiry', async () => {
		await harness.backend.append(OBSERVED);
		await harness.backend.append({
			type: FindingStatus.BASELINED,
			timestamp: new Date().toISOString(),
			fingerprint: 'fp1',
			expires_at: BASELINE_EXPIRES,
		});
		const record = await harness.backend.getFindingByFingerprint('fp1');
		expect(record?.baselined).toBe(true);
		expect(record?.baseline_expires_at).toBe(BASELINE_EXPIRES);
	});

	test('resolved finding reflects state', async () => {
		await harness.backend.append(OBSERVED);
		await harness.backend.append({
			type: FindingStatus.RESOLVED,
			timestamp: new Date().toISOString(),
			fingerprint: 'fp1',
		});
		const record = await harness.backend.getFindingByFingerprint('fp1');
		expect(record?.state).toBe(FindingStatus.RESOLVED);
	});

	test('getNotBaselinedFindings excludes baselined findings', async () => {
		await harness.backend.append(OBSERVED);
		await harness.backend.append(OBSERVED_2);
		await harness.backend.append({
			type: FindingStatus.BASELINED,
			timestamp: new Date().toISOString(),
			fingerprint: 'fp1',
			expires_at: BASELINE_EXPIRES,
		});
		const results = await harness.backend.getNotBaselinedFindings();
		expect(results).toHaveLength(1);
		expect(results[0]?.fingerprint).toBe('fp2');
	});
});

describe('axiom states', () => {
	const AXIOM_ID = 'axiom-001';

	test('declared axiom appears in getAllAxioms', async () => {
		await harness.backend.append({
			type: FindingStatus.AXIOM_DECLARED,
			timestamp: new Date().toISOString(),
			axiom_id: AXIOM_ID,
			scope: 'kernel',
			claim: 'Kernel is always pure',
		});
		const axioms = await harness.backend.getAllAxioms();
		expect(axioms).toHaveLength(1);
		expect(axioms[0]?.axiom_id).toBe(AXIOM_ID);
		expect(axioms[0]?.active).toBe(true);
		expect(axioms[0]?.claim).toBe('Kernel is always pure');
	});

	test('revoked axiom has active: false', async () => {
		await harness.backend.append({
			type: FindingStatus.AXIOM_DECLARED,
			timestamp: new Date().toISOString(),
			axiom_id: AXIOM_ID,
			scope: 'kernel',
			claim: 'Kernel is always pure',
		});
		await harness.backend.append({
			type: FindingStatus.AXIOM_REVOKED,
			timestamp: new Date().toISOString(),
			axiom_id: AXIOM_ID,
		});
		const axiom = await harness.backend.getAxiomByFingerprint(AXIOM_ID);
		expect(axiom?.active).toBe(false);
	});
});

describe('NDJSON round-trip', () => {
	test('new backend instance reads state written by another instance', async () => {
		await harness.backend.append(OBSERVED);
		await harness.backend.append({
			type: FindingStatus.RESOLVED,
			timestamp: new Date().toISOString(),
			fingerprint: 'fp1',
		});

		const fresh = new FilePathLedgerBackend({ path: harness.path });
		await fresh.initialize();

		const findings = await fresh.getAllFindings();
		expect(findings).toHaveLength(1);
		expect(findings[0]?.state).toBe(FindingStatus.RESOLVED);
	});
});
