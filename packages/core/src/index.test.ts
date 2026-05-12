import { describe, expect, test } from 'bun:test';
import { FindingStatus, type LedgerEventInput, type LedgerSnapshot } from '@maat-tools/contracts';
import { LedgerBackendBase } from './index';

// Concrete subclass to expose protected applyEvent
class TestLedger extends LedgerBackendBase {
	public append(_event: LedgerEventInput): Promise<void> {
		return Promise.resolve();
	}
	public getState(): Promise<LedgerSnapshot> {
		return Promise.resolve(emptySnapshot());
	}
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

describe('LedgerBackendBase.applyEvent', () => {
	test('OBSERVED on new fingerprint creates record with OBSERVED state', () => {
		const next = ledger.apply(emptySnapshot(), {
			entry_id: 'e1',
			run_id: 'r1',
			timestamp: 't',
			type: FindingStatus.OBSERVED,
			fingerprint: 'fp1',
			rule_id: 'r',
			message: 'msg',
			artifacts: [],
		});
		expect(next.findings.fp1?.state).toBe(FindingStatus.OBSERVED);
		expect(next.findings.fp1?.baselined).toBe(false);
	});

	test('OBSERVED on existing OBSERVED record keeps current state', () => {
		const snapshot = ledger.apply(emptySnapshot(), {
			entry_id: 'e1',
			run_id: 'r1',
			timestamp: 't',
			type: FindingStatus.OBSERVED,
			fingerprint: 'fp1',
			rule_id: 'r',
			message: 'msg',
			artifacts: [],
		});
		const again = ledger.apply(snapshot, {
			entry_id: 'e3',
			run_id: 'r1',
			timestamp: 't',
			type: FindingStatus.OBSERVED,
			fingerprint: 'fp1',
			rule_id: 'r',
			message: 'msg',
			artifacts: [],
		});
		expect(again.findings.fp1?.state).toBe(FindingStatus.OBSERVED);
	});

	test('OBSERVED on RESOLVED fingerprint resets to OBSERVED', () => {
		let s = emptySnapshot();
		s = ledger.apply(s, {
			entry_id: 'e1',
			run_id: 'r1',
			timestamp: 't',
			type: FindingStatus.OBSERVED,
			fingerprint: 'fp1',
			rule_id: 'r',
			message: 'msg',
			artifacts: [],
		});
		s = ledger.apply(s, {
			entry_id: 'e2',
			run_id: 'r1',
			timestamp: 't',
			type: FindingStatus.RESOLVED,
			fingerprint: 'fp1',
		});
		s = ledger.apply(s, {
			entry_id: 'e3',
			run_id: 'r1',
			timestamp: 't',
			type: FindingStatus.OBSERVED,
			fingerprint: 'fp1',
			rule_id: 'r',
			message: 'msg',
			artifacts: [],
		});
		expect(s.findings.fp1?.state).toBe(FindingStatus.OBSERVED);
	});

	test('BASELINED sets baselined=true without changing state', () => {
		let s = emptySnapshot();
		s = ledger.apply(s, {
			entry_id: 'e1',
			run_id: 'r1',
			timestamp: 't',
			type: FindingStatus.OBSERVED,
			fingerprint: 'fp1',
			rule_id: 'r',
			message: 'msg',
			artifacts: [],
		});
		s = ledger.apply(s, {
			entry_id: 'e2',
			run_id: 'r1',
			timestamp: 't',
			type: FindingStatus.BASELINED,
			fingerprint: 'fp1',
			expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
		});
		expect(s.findings.fp1?.baselined).toBe(true);
		expect(s.findings.fp1?.state).toBe(FindingStatus.OBSERVED);
	});

	test('RESOLVED sets state to RESOLVED', () => {
		let s = emptySnapshot();
		s = ledger.apply(s, {
			entry_id: 'e1',
			run_id: 'r1',
			timestamp: 't',
			type: FindingStatus.OBSERVED,
			fingerprint: 'fp1',
			rule_id: 'r',
			message: 'msg',
			artifacts: [],
		});
		s = ledger.apply(s, {
			entry_id: 'e2',
			run_id: 'r1',
			timestamp: 't',
			type: FindingStatus.RESOLVED,
			fingerprint: 'fp1',
		});
		expect(s.findings.fp1?.state).toBe(FindingStatus.RESOLVED);
	});

	test('AXIOM_DECLARED adds to axioms without touching findings', () => {
		const s = ledger.apply(emptySnapshot(), {
			entry_id: 'e1',
			run_id: 'r1',
			timestamp: 't',
			type: FindingStatus.AXIOM_DECLARED,
			axiom_id: 'ax1',
			scope: 'auth',
			claim: 'no side effects',
		});
		expect(s.axioms.ax1?.axiom_id).toBe('ax1');
		expect(Object.keys(s.findings)).toHaveLength(0);
	});

	test('any event updates last_entry_id', () => {
		const s = ledger.apply(emptySnapshot(), {
			entry_id: 'sentinel',
			run_id: 'r1',
			timestamp: 't',
			type: FindingStatus.OBSERVED,
			fingerprint: 'fp1',
			rule_id: 'r',
			message: 'msg',
			artifacts: [],
		});
		expect(s.last_entry_id).toBe('sentinel');
	});
});
