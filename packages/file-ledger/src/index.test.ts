import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FindingStatus } from '@maat-tools/contracts';
import { FilePathLedgerBackend } from './index';

let dir: string;
let ledgerPath: string;
let snapshotPath: string;
let ledger: FilePathLedgerBackend;

beforeEach(async () => {
	dir = join(tmpdir(), `maat-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await mkdir(dir, { recursive: true });
	ledgerPath = join(dir, 'test.ndjson');
	snapshotPath = join(dir, 'test.snapshot.json');
	ledger = new FilePathLedgerBackend({ path: ledgerPath });
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

const observedEvent = {
	type: FindingStatus.OBSERVED,
	timestamp: new Date().toISOString(),
	fingerprint: 'fp1',
	rule_id: 'rule@v1',
	message: 'test finding',
	artifacts: [],
} as const;

describe('FilePathLedgerBackend', () => {
	test('throws when path does not end with .ndjson', () => {
		expect(() => new FilePathLedgerBackend({ path: '/tmp/ledger.json' })).toThrow('path must end with ".ndjson"');
		expect(() => new FilePathLedgerBackend({ path: '/tmp/ledger' })).toThrow('path must end with ".ndjson"');
	});

	test('getState with no file returns empty snapshot', async () => {
		const state = await ledger.getState();
		expect(state.last_entry_id).toBeNull();
		expect(state.findings).toEqual({});
		expect(state.axioms).toEqual({});
	});

	test('append + getState reflects the appended event', async () => {
		await ledger.append(observedEvent);
		const state = await ledger.getState();
		expect(state.findings.fp1?.state).toBe(FindingStatus.OBSERVED);
		expect(state.findings.fp1?.rule_id).toBe('rule@v1');
	});

	test('append generates entry_id — callers must not provide it', async () => {
		await ledger.append(observedEvent);
		const line = (await Bun.file(ledgerPath).text()).trim();
		const event = JSON.parse(line);
		expect(typeof event.entry_id).toBe('string');
		expect(event.entry_id.length).toBeGreaterThan(0);
		const state = await ledger.getState();
		expect(state.last_entry_id).toBe(event.entry_id);
	});

	test('multiple appends accumulate correctly in snapshot', async () => {
		await ledger.append(observedEvent);
		await ledger.append({
			type: FindingStatus.BASELINED,
			timestamp: new Date().toISOString(),
			fingerprint: 'fp1',
			expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
		});
		await ledger.append({
			type: FindingStatus.OBSERVED,
			timestamp: new Date().toISOString(),
			fingerprint: 'fp2',
			rule_id: 'rule@v1',
			message: 'second finding',
			artifacts: [],
		});

		const state = await ledger.getState();
		expect(state.findings.fp1?.baselined).toBe(true);
		expect(state.findings.fp2?.state).toBe(FindingStatus.OBSERVED);
	});

	test('getState rebuilds from NDJSON when snapshot is missing', async () => {
		await ledger.append(observedEvent);
		await ledger.append({
			type: FindingStatus.RESOLVED,
			timestamp: new Date().toISOString(),
			fingerprint: 'fp1',
		});

		// Remove snapshot to force rebuild
		await unlink(snapshotPath);

		const fresh = new FilePathLedgerBackend({ path: ledgerPath });
		const state = await fresh.getState();
		expect(state.findings.fp1?.state).toBe(FindingStatus.RESOLVED);
	});
});
