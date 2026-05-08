import { access, appendFile, readFile, writeFile } from 'node:fs/promises';
import {
	defineLedgerBackend,
	type LedgerBackend,
	type LedgerEvent,
	type LedgerEventInput,
	type LedgerSnapshot,
} from '@maat-tools/contracts';
import { LedgerBackendBase } from '@maat-tools/core';

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
} from '@maat-tools/contracts';

export { defineLedgerBackend } from '@maat-tools/contracts';

type FilePathLedgerOptions = {
	path: string;
};

const EMPTY_SNAPSHOT: LedgerSnapshot = {
	last_entry_id: null,
	findings: {},
	axioms: {},
};

export class FilePathLedgerBackend extends LedgerBackendBase implements LedgerBackend {
	public constructor(private readonly options: FilePathLedgerOptions) {
		super();
	}

	public async append(input: LedgerEventInput): Promise<void> {
		const event = this.stampEvent(input);
		await Promise.all([
			appendFile(this.options.path, `${JSON.stringify(event)}\n`, 'utf-8'),
			this.updateSnapshot(event),
		]);
	}

	public async getState(): Promise<LedgerSnapshot> {
		const exists = await access(this.snapshotPath)
			.then(() => true)
			.catch(() => false);
		if (!exists) {
			return this.rebuildSnapshot();
		}
		return this.loadSnapshot();
	}

	private get snapshotPath(): string {
		return this.options.path.replace(/\.ndjson$/, '.snapshot.json');
	}

	private async loadSnapshot(): Promise<LedgerSnapshot> {
		const text = await readFile(this.snapshotPath, 'utf-8');
		return text.trim().length === 0 ? EMPTY_SNAPSHOT : (JSON.parse(text) as LedgerSnapshot);
	}

	private async persistSnapshot(snapshot: LedgerSnapshot): Promise<void> {
		await writeFile(this.snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');
	}

	private async updateSnapshot(event: LedgerEvent): Promise<void> {
		const exists = await access(this.snapshotPath)
			.then(() => true)
			.catch(() => false);
		const current = exists ? await this.loadSnapshot() : EMPTY_SNAPSHOT;
		await this.persistSnapshot(this.applyEvent(current, event));
	}

	private async readLog(): Promise<LedgerEvent[]> {
		const exists = await access(this.options.path)
			.then(() => true)
			.catch(() => false);
		if (!exists) {
			return [];
		}
		const text = await readFile(this.options.path, 'utf-8');

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

declare module '@maat-tools/contracts' {
	interface LedgerBackendRegistry {
		'@maat-tools/ledger': FilePathLedgerOptions;
	}
}

export default defineLedgerBackend((config: FilePathLedgerOptions) => new FilePathLedgerBackend(config));
