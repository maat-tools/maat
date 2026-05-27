import { readFileSync } from 'node:fs';
import { access, appendFile } from 'node:fs/promises';
import {
	type AxiomRecord,
	defineLedgerBackend,
	type FindingRecord,
	type LedgerBackend,
	type LedgerEvent,
	type LedgerEventInput,
	type LedgerSnapshot,
} from '@maat-tools/contracts';
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

type FilePathLedgerOptions = {
	path: string;
};

const EMPTY_SNAPSHOT: LedgerSnapshot = {
	last_entry_id: null,
	findings: {},
	axioms: {},
};

export class FilePathLedgerBackend extends LedgerBackendBase implements LedgerBackend {
	private initialized = false;
	private cache: LedgerSnapshot | null = null;

	public constructor(private readonly options: FilePathLedgerOptions) {
		super();
		if (!options.path.endsWith('.ndjson')) {
			throw new Error(`FilePathLedgerBackend: path must end with ".ndjson", got: "${options.path}"`);
		}
	}

	public async initialize(): Promise<void> {
		if (this.initialized) {
			throw new Error('FilePathLedgerBackend: already initialized');
		}
		this.cache = await this.getState();
		this.initialized = true;
	}

	public async append(input: LedgerEventInput): Promise<void> {
		if (!this.initialized || this.cache === null) {
			throw new Error('FilePathLedgerBackend: not initialized');
		}

		try {
			const event = this.stampEvent(input);
			await appendFile(this.options.path, `${JSON.stringify(event)}\n`, 'utf-8');
			this.cache = this.applyEvent(this.cache, event);
		} catch (err) {
			throw new Error(`FilePathLedgerBackend: failed to append event: ${(err as Error).message}`);
		}
	}

	public async getAxiomByFingerprint(fingerprint: string): Promise<AxiomRecord | null> {
		if (!this.initialized || this.cache === null) {
			throw new Error('FilePathLedgerBackend: not initialized');
		}

		return this.cache.axioms[fingerprint] ?? null;
	}

	public async getFindingByFingerprint(fingerprint: string): Promise<FindingRecord | null> {
		if (!this.initialized || this.cache === null) {
			throw new Error('FilePathLedgerBackend: not initialized');
		}

		return this.cache.findings[fingerprint] ?? null;
	}

	public async getNotBaselinedFindings(): Promise<FindingRecord[]> {
		if (!this.initialized || this.cache === null) {
			throw new Error('FilePathLedgerBackend: not initialized');
		}

		return Object.values(this.cache.findings).filter((f) => !f.baselined);
	}

	public async getAllAxioms(): Promise<AxiomRecord[]> {
		if (!this.initialized || this.cache === null) {
			throw new Error('FilePathLedgerBackend: not initialized');
		}

		return Object.values(this.cache.axioms);
	}

	public async getAllFindings(): Promise<FindingRecord[]> {
		if (!this.initialized || this.cache === null) {
			throw new Error('FilePathLedgerBackend: not initialized');
		}

		return Object.values(this.cache.findings);
	}

	private async getState(): Promise<LedgerSnapshot> {
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

		const text = readFileSync(this.options.path, 'utf-8');
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
		'@maat-tools/file-ledger': FilePathLedgerOptions;
	}
}

export default defineLedgerBackend((config: FilePathLedgerOptions) => new FilePathLedgerBackend(config));
