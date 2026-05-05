import { appendFile, writeFile } from 'node:fs/promises';
import {
	defineLedgerBackend,
	FindingStatus,
	type AxiomDeclaredEvent,
	type FindingRecord,
	type LedgerBackend,
	type LedgerEvent,
	type LedgerSnapshot,
} from '@maat/contracts';
import { LedgerBackendBase } from '../../core/src';

export type {
	AxiomDeclaredEvent,
	FindingBaselinedEvent,
	FindingEnforcedEvent,
	FindingObservedEvent,
	FindingPromotedEvent,
	FindingRecord,
	FindingState,
	LedgerBackend,
	LedgerEvent,
	LedgerSnapshot,
} from '@maat/contracts';

export { defineLedgerBackend } from '@maat/contracts';

type FilePathLedgerInput = {
	path: string;
};

const EMPTY_SNAPSHOT: LedgerSnapshot = { last_entry_id: null, findings: {}, axioms: {} };

export class FilePathLedgerBackend extends LedgerBackendBase implements LedgerBackend {
	constructor(private readonly options: FilePathLedgerInput) {
		super();
	}

	public async append(event: LedgerEvent): Promise<void> {
		await Promise.all([
			appendFile(this.options.path, `${JSON.stringify(event)}\n`, 'utf-8'),
			this.updateSnapshot(event),
		]);
	}

	public async getState(): Promise<LedgerSnapshot> {
		const file = Bun.file(this.snapshotPath);
		if (!(await file.exists())) {
			return this.rebuildSnapshot();
		}

		return JSON.parse(await file.text()) as LedgerSnapshot;
	}

	private get snapshotPath(): string {
		return this.options.path.replace(/\.ndjson$/, '.snapshot.json');
	}

	private async updateSnapshot(event: LedgerEvent): Promise<void> {
		const snapshotFile = Bun.file(this.snapshotPath);
		const current: LedgerSnapshot = (await snapshotFile.exists())
			? JSON.parse(await snapshotFile.text()) as LedgerSnapshot
			: EMPTY_SNAPSHOT;

		const updated = this.applyEvent(current, event);
		await writeFile(this.snapshotPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf-8');
	}

	private applyEvent(snapshot: LedgerSnapshot, event: LedgerEvent): LedgerSnapshot {
		const findings = { ...snapshot.findings };
		const axioms = { ...snapshot.axioms };

		if (event.type === FindingStatus.OBSERVED) {
			findings[event.fingerprint] = {
				fingerprint: event.fingerprint,
				state: 'observed',
				baselined: false,
				rule_id: event.rule_id,
				message: event.message,
				artifacts: event.artifacts,
			} satisfies FindingRecord;
		} else if (event.type === FindingStatus.BASELINED) {
			const record = findings[event.fingerprint];
			if (record !== undefined) {
				findings[event.fingerprint] = { ...record, baselined: true };
			}
		} else if (event.type === FindingStatus.PROMOTED) {
			const record = findings[event.fingerprint];
			if (record !== undefined) {
				findings[event.fingerprint] = { ...record, state: 'promoted' };
			}
		} else if (event.type === FindingStatus.ENFORCED) {
			const record = findings[event.fingerprint];
			if (record !== undefined) {
				findings[event.fingerprint] = { ...record, state: 'enforced' };
			}
		} else if (event.type === FindingStatus.AXIOM_DECLARED) {
			axioms[event.axiom_id] = event satisfies AxiomDeclaredEvent;
		}

		return { last_entry_id: event.entry_id, findings, axioms };
	}

	private async readLog(): Promise<LedgerEvent[]> {
		const file = Bun.file(this.options.path);
		if (!(await file.exists())) {
			return [];
		}

		const text = await file.text();
		return text
			.split('\n')
			.filter((line) => line.trim().length > 0)
			.map((line) => JSON.parse(line) as LedgerEvent);
	}

	private async rebuildSnapshot(): Promise<LedgerSnapshot> {
		const events = await this.readLog();
		let snapshot: LedgerSnapshot = EMPTY_SNAPSHOT;
		for (const event of events) {
			snapshot = this.applyEvent(snapshot, event);
		}
		await writeFile(this.snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');

		return snapshot;
	}
}

declare module '@maat/contracts' {
	interface LedgerBackendRegistry {
		'@maat/ledger': FilePathLedgerInput;
	}
}

export default defineLedgerBackend(
	(config: FilePathLedgerInput) => new FilePathLedgerBackend(config),
);
