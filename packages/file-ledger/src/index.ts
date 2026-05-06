import { appendFile, writeFile } from 'node:fs/promises';
import {
	defineLedgerBackend,
	type LedgerBackend,
	type LedgerEvent,
	type LedgerEventInput,
	type LedgerSnapshot,
} from '@maat/contracts';
import { ulid } from 'ulid';
import { LedgerBackendBase } from '../../core/src';

export type {
	AxiomDeclaredEvent,
	FindingBaselinedEvent,
	FindingEnforcedEvent,
	FindingObservedEvent,
	FindingPromotedEvent,
	FindingRecord,
	LedgerBackend,
	LedgerEvent,
	LedgerSnapshot,
} from '@maat/contracts';

export { defineLedgerBackend } from '@maat/contracts';

type FilePathLedgerInput = {
	path: string;
};

const EMPTY_SNAPSHOT: LedgerSnapshot = {
	last_entry_id: null,
	findings: {},
	axioms: {},
};

export class FilePathLedgerBackend
	extends LedgerBackendBase
	implements LedgerBackend
{
	constructor(private readonly options: FilePathLedgerInput) {
		super();
	}

	public async append(input: LedgerEventInput): Promise<void> {
		const event = { entry_id: ulid(), ...input } as LedgerEvent;
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

		const text = await file.text();
		if (text.trim().length === 0) {
			return EMPTY_SNAPSHOT;
		}

		return JSON.parse(text) as LedgerSnapshot;
	}

	private get snapshotPath(): string {
		return this.options.path.replace(/\.ndjson$/, '.snapshot.json');
	}

	private async updateSnapshot(event: LedgerEvent): Promise<void> {
		const snapshotFile = Bun.file(this.snapshotPath);
		const current: LedgerSnapshot = (await snapshotFile.exists())
			? (JSON.parse(await snapshotFile.text()) as LedgerSnapshot)
			: EMPTY_SNAPSHOT;

		const updated = this.applyEvent(current, event);
		await writeFile(
			this.snapshotPath,
			`${JSON.stringify(updated, null, 2)}\n`,
			'utf-8',
		);
	}

	private async readLog(): Promise<LedgerEvent[]> {
		const file = Bun.file(this.options.path);
		if (!(await file.exists())) {
			return [];
		}

		const text = await file.text();

		if (text.trim().length === 0) {
			return [];
		}

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

		await writeFile(
			this.snapshotPath,
			`${JSON.stringify(snapshot, null, 2)}\n`,
			'utf-8',
		);

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
