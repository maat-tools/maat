import { afterEach, describe, expect, test } from 'bun:test';
import { unlink } from 'node:fs/promises';
import { FilePathLedgerBackend } from './index';
import type {
	AxiomDeclaredEvent,
	FindingBaselinedEvent,
	FindingEnforcedEvent,
	FindingObservedEvent,
	FindingPromotedEvent,
} from './index';

const TEST_LEDGER = '/tmp/maat-test-ledger.jsonl';

// Fields shared by all events passed to append() — no entry_id, backend generates it
const BASE = {
	timestamp: '2026-05-02T00:00:00.000Z',
} as const;

// Fields for events passed directly to fold() — fold works on stored events that already have entry_id
const STORED_BASE = {
	...BASE,
	entry_id: '01JTEST00000000000000000000',
} as const;

function makeBackend(): FilePathLedgerBackend {
	return new FilePathLedgerBackend({ path: TEST_LEDGER });
}

async function readLines(path: string): Promise<unknown[]> {
	const file = Bun.file(path);
	if (!(await file.exists())) return [];
	const text = await file.text();
	return text
		.split('\n')
		.filter((l) => l.trim().length > 0)
		.map((l) => JSON.parse(l));
}

afterEach(async () => {
	try {
		await unlink(TEST_LEDGER);
	} catch {
		// file may not have been created
	}
});

// ─── append ───────────────────────────────────────────────────────────────────

describe('FilePathLedgerBackend.append()', () => {
	test('creates the file when it does not exist', async () => {
		const backend = makeBackend();
		const event: Omit<FindingObservedEvent, 'entry_id'> = {
			...BASE,
			type: 'finding.observed',
			fingerprint: 'fp1',
			rule_id: 'r1',
			message: 'test',
			artifacts: [],
		};
		await backend.append(event);
		const lines = await readLines(TEST_LEDGER);
		expect(lines).toHaveLength(1);
	});

	test('generated entry_id is a 26-character Crockford base-32 string', async () => {
		const backend = makeBackend();
		await backend.append({
			...BASE,
			type: 'finding.observed',
			fingerprint: 'fp1',
			rule_id: 'r1',
			message: 'test',
			artifacts: [],
		});
		const [entry] = await readLines(TEST_LEDGER);
		expect((entry as { entry_id: string }).entry_id).toMatch(
			/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/,
		);
	});

	test('each append generates a unique entry_id', async () => {
		const backend = makeBackend();
		const event: Omit<FindingObservedEvent, 'entry_id'> = {
			...BASE,
			type: 'finding.observed',
			fingerprint: 'fp1',
			rule_id: 'r1',
			message: 'test',
			artifacts: [],
		};
		await backend.append(event);
		await backend.append(event);
		const lines = await readLines(TEST_LEDGER);
		const ids = lines.map((l) => (l as { entry_id: string }).entry_id);
		expect(new Set(ids).size).toBe(2);
	});

	test('all original event fields are preserved in the written entry', async () => {
		const backend = makeBackend();
		const event: Omit<FindingObservedEvent, 'entry_id'> = {
			...BASE,
			type: 'finding.observed',
			fingerprint: 'fp-abc',
			rule_id: 'rule-com',
			message: 'literal "admin" appears in 4 files',
			artifacts: [{ kind: 'source', data: { file: 'a.ts' } }],
		};
		await backend.append(event);
		const [entry] = await readLines(TEST_LEDGER);
		const e = entry as typeof event & { entry_id: string };
		expect(e.type).toBe('finding.observed');
		expect(e.fingerprint).toBe('fp-abc');
		expect(e.rule_id).toBe('rule-com');
		expect(e.message).toBe('literal "admin" appears in 4 files');
		expect(e.artifacts).toEqual([{ kind: 'source', data: { file: 'a.ts' } }]);

	});

	test('multiple appends preserve insertion order', async () => {
		const backend = makeBackend();
		await backend.append({
			...BASE,
			type: 'finding.observed',
			fingerprint: 'fp1',
			rule_id: 'r1',
			message: 'first',
			artifacts: [],
		});
		await backend.append({
			...BASE,
			type: 'finding.promoted',
			fingerprint: 'fp1',
		});
		const lines = await readLines(TEST_LEDGER);
		expect(lines).toHaveLength(2);
		expect((lines[0] as { type: string }).type).toBe('finding.observed');
		expect((lines[1] as { type: string }).type).toBe('finding.promoted');
	});

	test('all five event types survive a round-trip', async () => {
		const backend = makeBackend();
		const events: Omit<
			| FindingObservedEvent
			| FindingBaselinedEvent
			| FindingPromotedEvent
			| FindingEnforcedEvent
			| AxiomDeclaredEvent,
			'entry_id'
		>[] = [
			{
				...BASE,
				type: 'finding.observed',
				fingerprint: 'fp1',
				rule_id: 'r1',
				message: 'test',
				artifacts: [],
			},
			{ ...BASE, type: 'finding.baselined', fingerprint: 'fp1' },
			{ ...BASE, type: 'finding.promoted', fingerprint: 'fp1', note: 'intentional' },
			{ ...BASE, type: 'finding.enforced', fingerprint: 'fp1' },
			{ ...BASE, type: 'axiom.declared', axiom_id: 'a1', scope: 'src/auth/', claim: 'auth owns tokens' },
		];
		for (const e of events) await backend.append(e);
		const lines = await readLines(TEST_LEDGER);
		expect(lines).toHaveLength(5);
		const types = lines.map((l) => (l as { type: string }).type);
		expect(types).toEqual([
			'finding.observed',
			'finding.baselined',
			'finding.promoted',
			'finding.enforced',
			'axiom.declared',
		]);
	});
});

// ─── readAll ──────────────────────────────────────────────────────────────────

describe('FilePathLedgerBackend / readAll()', () => {
	test('returns [] when the file does not exist', async () => {
		const backend = makeBackend();
		const events = await (backend as unknown as { readAll(): Promise<unknown[]> }).readAll();
		expect(events).toEqual([]);
	});

	test('returns all appended events', async () => {
		const backend = makeBackend();
		await backend.append({
			...BASE,
			type: 'finding.observed',
			fingerprint: 'fp1',
			rule_id: 'r1',
			message: 'test',
			artifacts: [],
		});
		await backend.append({
			...BASE,
			type: 'finding.promoted',
			fingerprint: 'fp1',
		});
		const events = await (backend as unknown as { readAll(): Promise<unknown[]> }).readAll();
		expect(events).toHaveLength(2);
	});
});

// ─── fold ─────────────────────────────────────────────────────────────────────

type FoldFn = (events: unknown[]) => Promise<Map<string, { state: string; baselined: boolean; rule_id: string; artifacts: unknown[] }>>;

function fold(backend: FilePathLedgerBackend, events: unknown[]) {
	return (backend as unknown as { fold: FoldFn }).fold(events);
}

describe('FilePathLedgerBackend / fold()', () => {
	test('returns empty map for empty event list', async () => {
		expect(await fold(makeBackend(), [])).toEqual(new Map());
	});

	test('observed finding starts as observed, not baselined', async () => {
		const records = await fold(makeBackend(), [
			{
				...STORED_BASE,
				type: 'finding.observed',
				fingerprint: 'fp1',
				rule_id: 'r1',
				message: 'test',
				artifacts: [],
			},
		]);
		expect(records.get('fp1')?.state).toBe('observed');
		expect(records.get('fp1')?.baselined).toBe(false);
	});

	test('baselined event sets baselined=true, state stays observed', async () => {
		const records = await fold(makeBackend(), [
			{
				...STORED_BASE,
				type: 'finding.observed',
				fingerprint: 'fp1',
				rule_id: 'r1',
				message: 'test',
				artifacts: [],
			},
			{ ...STORED_BASE, type: 'finding.baselined', fingerprint: 'fp1' },
		]);
		expect(records.get('fp1')?.state).toBe('observed');
		expect(records.get('fp1')?.baselined).toBe(true);
	});

	test('promoted finding becomes promoted', async () => {
		const records = await fold(makeBackend(), [
			{
				...STORED_BASE,
				type: 'finding.observed',
				fingerprint: 'fp1',
				rule_id: 'r1',
				message: 'test',
				artifacts: [],
			},
			{ ...STORED_BASE, type: 'finding.promoted', fingerprint: 'fp1' },
		]);
		expect(records.get('fp1')?.state).toBe('promoted');
	});

	test('enforced finding becomes enforced', async () => {
		const records = await fold(makeBackend(), [
			{
				...STORED_BASE,
				type: 'finding.observed',
				fingerprint: 'fp1',
				rule_id: 'r1',
				message: 'test',
				artifacts: [],
			},
			{ ...STORED_BASE, type: 'finding.promoted', fingerprint: 'fp1' },
			{ ...STORED_BASE, type: 'finding.enforced', fingerprint: 'fp1' },
		]);
		expect(records.get('fp1')?.state).toBe('enforced');
	});

	test('full lifecycle: observed → baselined → promoted → enforced', async () => {
		const records = await fold(makeBackend(), [
			{
				...STORED_BASE,
				type: 'finding.observed',
				fingerprint: 'fp1',
				rule_id: 'r1',
				message: 'test',
				artifacts: [{ kind: 'source', data: { file: 'a.ts' } }],
			},
			{ ...STORED_BASE, type: 'finding.baselined', fingerprint: 'fp1' },
			{ ...STORED_BASE, type: 'finding.promoted', fingerprint: 'fp1' },
			{ ...STORED_BASE, type: 'finding.enforced', fingerprint: 'fp1' },
		]);
		const record = records.get('fp1');
		expect(record?.state).toBe('enforced');
		expect(record?.baselined).toBe(true);
		expect(record?.rule_id).toBe('r1');
		expect(record?.artifacts).toEqual([{ kind: 'source', data: { file: 'a.ts' } }]);
	});

	test('multiple findings are tracked independently', async () => {
		const records = await fold(makeBackend(), [
			{
				...STORED_BASE,
				type: 'finding.observed',
				fingerprint: 'fp1',
				rule_id: 'r1',
				message: 'first',
				artifacts: [],
			},
			{
				...STORED_BASE,
				type: 'finding.observed',
				fingerprint: 'fp2',
				rule_id: 'r1',
				message: 'second',
				artifacts: [],
			},
			{ ...STORED_BASE, type: 'finding.promoted', fingerprint: 'fp1' },
		]);
		expect(records.get('fp1')?.state).toBe('promoted');
		expect(records.get('fp2')?.state).toBe('observed');
	});

	test('axiom.declared events do not create a FindingRecord', async () => {
		const records = await fold(makeBackend(), [
			{
				...STORED_BASE,
				type: 'axiom.declared',
				axiom_id: 'a1',
				scope: 'src/auth/',
				claim: 'auth owns tokens',
			},
		]);
		expect(records.size).toBe(0);
	});

	test('events for unknown fingerprint are silently ignored', async () => {
		const records = await fold(makeBackend(), [
			{ ...STORED_BASE, type: 'finding.promoted', fingerprint: 'ghost' },
		]);
		expect(records.has('ghost')).toBe(false);
	});
});
