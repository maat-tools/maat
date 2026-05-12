import { access, appendFile, readFile } from 'node:fs/promises';
import type { LedgerBackend, LedgerEvent, LedgerEventInput, LedgerSnapshot } from '@maat-tools/contracts';
import { LedgerBackendBase } from '@maat-tools/core';

export type {
	AxiomDeclaredEvent,
	FindingBaselinedEvent,
	FindingObservedEvent,
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
		if (!options.path.endsWith('.ndjson')) {
			throw new Error(`FilePathLedgerBackend: path must end with ".ndjson", got: "${options.path}"`);
		}
	}

	public async append(input: LedgerEventInput): Promise<void> {
		const event = this.stampEvent(input);
		await appendFile(this.options.path, `${JSON.stringify(event)}\n`, 'utf-8');
	}

	public async getState(): Promise<LedgerSnapshot> {
		const events = await this.readLog();
		return events.reduce((snapshot, event) => this.applyEvent(snapshot, event), EMPTY_SNAPSHOT as LedgerSnapshot);
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
					.filter(Boolean)
					.map((line) => JSON.parse(line) as LedgerEvent);
	}
}

declare module '@maat-tools/contracts' {
	interface LedgerBackendRegistry {
		'@maat-tools/ledger': FilePathLedgerOptions;
	}
}
