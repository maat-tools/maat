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

type FilePathLedgerOptions = {
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
	public constructor(private readonly options: FilePathLedgerOptions) {
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
		const snapshotFile = Bun.file(this.snapshotPath);
		if (!(await snapshotFile.exists())) {
			return this.rebuildSnapshot();
		}
		return this.loadSnapshot();
	}

	private get snapshotPath(): string {
		return this.options.path.replace(/\.ndjson$/, '.snapshot.json');
	}

	private async loadSnapshot(): Promise<LedgerSnapshot> {
		const text = await Bun.file(this.snapshotPath).text();
		return text.trim().length === 0
			? EMPTY_SNAPSHOT
			: (JSON.parse(text) as LedgerSnapshot);
	}

	private async persistSnapshot(snapshot: LedgerSnapshot): Promise<void> {
		await writeFile(
			this.snapshotPath,
			`${JSON.stringify(snapshot, null, 2)}\n`,
			'utf-8',
		);
	}

	private async updateSnapshot(event: LedgerEvent): Promise<void> {
		const snapshotFile = Bun.file(this.snapshotPath);
		const current = (await snapshotFile.exists())
			? await this.loadSnapshot()
			: EMPTY_SNAPSHOT;
		await this.persistSnapshot(this.applyEvent(current, event));
	}

	private async readLog(): Promise<LedgerEvent[]> {
		const file = Bun.file(this.options.path);
		if (!(await file.exists())) {
			return [];
		}
		const text = await file.text();
		return text.trim().length === 0
			? []
			: text
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
		await this.persistSnapshot(snapshot);
		return snapshot;
	}
}

declare module '@maat/contracts' {
	interface LedgerBackendRegistry {
		'@maat/ledger': FilePathLedgerOptions;
	}
}

export default defineLedgerBackend(
	(config: FilePathLedgerOptions) => new FilePathLedgerBackend(config),
);
