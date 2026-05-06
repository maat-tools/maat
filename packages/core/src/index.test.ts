import { describe, expect, test } from 'bun:test';
import { FindingStatus, type LedgerEventInput, type LedgerSnapshot } from '@maat/contracts';
import { LedgerBackendBase, stableHash, stableStringify } from './index';

// Concrete subclass to expose protected applyEvent
class TestLedger extends LedgerBackendBase {
	append(_event: LedgerEventInput): Promise<void> { return Promise.resolve(); }
	getState(): Promise<LedgerSnapshot> { return Promise.resolve(emptySnapshot()); }
	public apply(snapshot: LedgerSnapshot, event: Parameters<LedgerBackendBase['applyEvent']>[1]) {
		return this.applyEvent(snapshot, event);
	}
}

function emptySnapshot(): LedgerSnapshot {
	return { last_entry_id: null, findings: {}, axioms: {} };
}

const ledger = new TestLedger();

const baseFinding = {
	fingerprint: 'fp1',
	ruleId: 'rule@v1',
	message: 'msg',
	artifacts: [],
};

describe('stableStringify', () => {
	test('sorts object keys', () => {
		expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
	});

	test('sorts nested object keys', () => {
		expect(stableStringify({ z: { b: 1, a: 2 } })).toBe(stableStringify({ z: { a: 2, b: 1 } }));
	});

	test('preserves array order', () => {
		expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
	});

	test('handles primitives', () => {
		expect(stableStringify(null)).toBe('null');
		expect(stableStringify('hello')).toBe('"hello"');
		expect(stableStringify(42)).toBe('42');
		expect(stableStringify(true)).toBe('true');
	});
});

describe('stableHash', () => {
	test('same input produces same hash', () => {
		expect(stableHash({ b: 1, a: 2 })).toBe(stableHash({ a: 2, b: 1 }));
	});

	test('different inputs produce different hashes', () => {
		expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
	});
});

describe('LedgerBackendBase.applyEvent', () => {
	test('OBSERVED on new fingerprint creates record with OBSERVED state', () => {
		const next = ledger.apply(emptySnapshot(), {
			entry_id: 'e1', timestamp: 't',
			type: FindingStatus.OBSERVED,
			fingerprint: 'fp1', rule_id: 'r', message: 'msg', artifacts: [],
		});
		expect(next.findings['fp1']?.state).toBe(FindingStatus.OBSERVED);
		expect(next.findings['fp1']?.baselined).toBe(false);
	});

	test('OBSERVED on existing non-RESOLVED record keeps current state', () => {
		const snapshot = ledger.apply(emptySnapshot(), {
			entry_id: 'e1', timestamp: 't',
			type: FindingStatus.OBSERVED,
			fingerprint: 'fp1', rule_id: 'r', message: 'msg', artifacts: [],
		});
		const promoted = ledger.apply(snapshot, {
			entry_id: 'e2', timestamp: 't',
			type: FindingStatus.PROMOTED,
			fingerprint: 'fp1',
		});
		const again = ledger.apply(promoted, {
			entry_id: 'e3', timestamp: 't',
			type: FindingStatus.OBSERVED,
			fingerprint: 'fp1', rule_id: 'r', message: 'msg', artifacts: [],
		});
		expect(again.findings['fp1']?.state).toBe(FindingStatus.PROMOTED);
	});

	test('OBSERVED on RESOLVED fingerprint resets to OBSERVED', () => {
		let s = emptySnapshot();
		s = ledger.apply(s, { entry_id: 'e1', timestamp: 't', type: FindingStatus.OBSERVED, fingerprint: 'fp1', rule_id: 'r', message: 'msg', artifacts: [] });
		s = ledger.apply(s, { entry_id: 'e2', timestamp: 't', type: FindingStatus.RESOLVED, fingerprint: 'fp1' });
		s = ledger.apply(s, { entry_id: 'e3', timestamp: 't', type: FindingStatus.OBSERVED, fingerprint: 'fp1', rule_id: 'r', message: 'msg', artifacts: [] });
		expect(s.findings['fp1']?.state).toBe(FindingStatus.OBSERVED);
	});

	test('BASELINED sets baselined=true without changing state', () => {
		let s = emptySnapshot();
		s = ledger.apply(s, { entry_id: 'e1', timestamp: 't', type: FindingStatus.OBSERVED, fingerprint: 'fp1', rule_id: 'r', message: 'msg', artifacts: [] });
		s = ledger.apply(s, { entry_id: 'e2', timestamp: 't', type: FindingStatus.BASELINED, fingerprint: 'fp1' });
		expect(s.findings['fp1']?.baselined).toBe(true);
		expect(s.findings['fp1']?.state).toBe(FindingStatus.OBSERVED);
	});

	test('PROMOTED sets state to PROMOTED', () => {
		let s = emptySnapshot();
		s = ledger.apply(s, { entry_id: 'e1', timestamp: 't', type: FindingStatus.OBSERVED, fingerprint: 'fp1', rule_id: 'r', message: 'msg', artifacts: [] });
		s = ledger.apply(s, { entry_id: 'e2', timestamp: 't', type: FindingStatus.PROMOTED, fingerprint: 'fp1' });
		expect(s.findings['fp1']?.state).toBe(FindingStatus.PROMOTED);
	});

	test('ENFORCED sets state to ENFORCED', () => {
		let s = emptySnapshot();
		s = ledger.apply(s, { entry_id: 'e1', timestamp: 't', type: FindingStatus.OBSERVED, fingerprint: 'fp1', rule_id: 'r', message: 'msg', artifacts: [] });
		s = ledger.apply(s, { entry_id: 'e2', timestamp: 't', type: FindingStatus.ENFORCED, fingerprint: 'fp1' });
		expect(s.findings['fp1']?.state).toBe(FindingStatus.ENFORCED);
	});

	test('RESOLVED sets state to RESOLVED', () => {
		let s = emptySnapshot();
		s = ledger.apply(s, { entry_id: 'e1', timestamp: 't', type: FindingStatus.OBSERVED, fingerprint: 'fp1', rule_id: 'r', message: 'msg', artifacts: [] });
		s = ledger.apply(s, { entry_id: 'e2', timestamp: 't', type: FindingStatus.RESOLVED, fingerprint: 'fp1' });
		expect(s.findings['fp1']?.state).toBe(FindingStatus.RESOLVED);
	});

	test('AXIOM_DECLARED adds to axioms without touching findings', () => {
		const s = ledger.apply(emptySnapshot(), {
			entry_id: 'e1', timestamp: 't',
			type: FindingStatus.AXIOM_DECLARED,
			axiom_id: 'ax1', scope: 'auth', claim: 'no side effects',
		});
		expect(s.axioms['ax1']?.axiom_id).toBe('ax1');
		expect(Object.keys(s.findings)).toHaveLength(0);
	});

	test('any event updates last_entry_id', () => {
		const s = ledger.apply(emptySnapshot(), {
			entry_id: 'sentinel', timestamp: 't',
			type: FindingStatus.OBSERVED,
			fingerprint: 'fp1', rule_id: 'r', message: 'msg', artifacts: [],
		});
		expect(s.last_entry_id).toBe('sentinel');
	});
});

describe('LedgerBackendBase.buildEntry', () => {
	test('OBSERVED includes rule_id, message, artifacts, fingerprint', () => {
		const event = ledger.buildEntry(baseFinding, FindingStatus.OBSERVED);
		expect(event.type).toBe(FindingStatus.OBSERVED);
		if (event.type === FindingStatus.OBSERVED) {
			expect(event.rule_id).toBe(baseFinding.ruleId);
			expect(event.message).toBe(baseFinding.message);
			expect(event.artifacts).toEqual(baseFinding.artifacts);
			expect(event.fingerprint).toBe(baseFinding.fingerprint);
		}
	});

	test('BASELINED has only fingerprint (no message or artifacts)', () => {
		const event = ledger.buildEntry(baseFinding, FindingStatus.BASELINED);
		expect(event.type).toBe(FindingStatus.BASELINED);
		expect('message' in event).toBe(false);
		expect('artifacts' in event).toBe(false);
		expect(event.fingerprint).toBe(baseFinding.fingerprint);
	});

	test('PROMOTED has only fingerprint', () => {
		const event = ledger.buildEntry(baseFinding, FindingStatus.PROMOTED);
		expect(event.type).toBe(FindingStatus.PROMOTED);
		expect('message' in event).toBe(false);
		expect(event.fingerprint).toBe(baseFinding.fingerprint);
	});

	test('ENFORCED has only fingerprint', () => {
		const event = ledger.buildEntry(baseFinding, FindingStatus.ENFORCED);
		expect(event.type).toBe(FindingStatus.ENFORCED);
		expect('message' in event).toBe(false);
		expect(event.fingerprint).toBe(baseFinding.fingerprint);
	});
});
