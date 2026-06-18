import { isAbsolute, join } from 'node:path';
import {
	type AxiomEvent,
	defineLedgerBackend,
	type FindingEvent,
	FindingStatus,
	type LedgerBackend,
	type LedgerEvent,
	type LedgerEventInput,
} from '@maat-tools/contracts';
import { LedgerBackendBase, type LedgerSnapshot } from '@maat-tools/core';
import { appendToFile, pathExists, readFileContent, resolveProjectRoot } from '@maat-tools/utils';

export type {
	AxiomEvent,
	FindingEvent,
	LedgerBackend,
	LedgerEvent,
} from '@maat-tools/contracts';

type FilePathLedgerOptions = {
	path: string;
};

const EMPTY_SNAPSHOT: LedgerSnapshot = {
	lastEntryId: null,
	findings: {},
	axioms: {},
};

export class FilePathLedgerBackend extends LedgerBackendBase implements LedgerBackend {
	private initialized = false;
	private cache: LedgerSnapshot = EMPTY_SNAPSHOT;

	private readonly resolvedPath: string;

	public constructor(options: FilePathLedgerOptions) {
		super();
		if (!options.path.endsWith('.ndjson')) {
			throw new Error(`FilePathLedgerBackend: path must end with ".ndjson", got: "${options.path}"`);
		}

		this.resolvedPath = isAbsolute(options.path) ? options.path : join(resolveProjectRoot(), options.path);
	}

	public async initialize(): Promise<void> {
		if (this.initialized) {
			throw new Error('FilePathLedgerBackend: already initialized');
		}
		this.cache = await this.getState();
		this.initialized = true;
	}

	public async append(input: LedgerEventInput): Promise<void> {
		if (!this.initialized) {
			throw new Error('FilePathLedgerBackend: not initialized');
		}

		const current = 'fingerprint' in input ? this.cache.findings[input.fingerprint] : this.cache.axioms[input.axiomId];
		this.assertValidTransition(current, input);

		try {
			const event = this.stampEvent(input);
			await appendToFile(this.resolvedPath, `${JSON.stringify(event)}\n`, 'utf-8');
			this.cache = this.applyEventLastWriteWins(this.cache, event);
		} catch (err) {
			throw new Error(`FilePathLedgerBackend: failed to append event: ${(err as Error).message}`);
		}
	}

	public async getAxiomByFingerprint(fingerprint: string): Promise<AxiomEvent | null> {
		if (!this.initialized) {
			throw new Error('FilePathLedgerBackend: not initialized');
		}

		return this.cache.axioms[fingerprint] ?? null;
	}

	public async getFindingByFingerprint(fingerprint: string): Promise<FindingEvent | null> {
		if (!this.initialized) {
			throw new Error('FilePathLedgerBackend: not initialized');
		}

		return this.cache.findings[fingerprint] ?? null;
	}

	public async getNotBaselinedFindingsState(): Promise<FindingEvent[]> {
		if (!this.initialized) {
			throw new Error('FilePathLedgerBackend: not initialized');
		}

		const now = Date.now();

		return Object.values(this.cache.findings).filter(
			(f) =>
				f.type === FindingStatus.OBSERVED ||
				(f.type === FindingStatus.BASELINED && new Date(f.expiresAt).getTime() <= now),
		);
	}

	public async getAllAxiomsState(): Promise<AxiomEvent[]> {
		if (!this.initialized) {
			throw new Error('FilePathLedgerBackend: not initialized');
		}

		return Object.values(this.cache.axioms);
	}

	public async getAllFindingsState(): Promise<FindingEvent[]> {
		if (!this.initialized) {
			throw new Error('FilePathLedgerBackend: not initialized');
		}

		return Object.values(this.cache.findings);
	}

	private async getState(): Promise<LedgerSnapshot> {
		const events = await this.readLog();

		return events.reduce((snapshot, event) => this.applyEventLastWriteWins(snapshot, event), EMPTY_SNAPSHOT);
	}

	private async readLog(): Promise<LedgerEvent[]> {
		const exists = await pathExists(this.resolvedPath);

		if (!exists) {
			return [];
		}

		const text = await readFileContent(this.resolvedPath, 'utf-8');

		return text.trim().length === 0
			? []
			: text
					.split('\n')
					.filter(Boolean)
					.map((line) => JSON.parse(line));
	}
}

declare module '@maat-tools/contracts' {
	interface LedgerBackendRegistry {
		'@maat-tools/file-ledger': FilePathLedgerOptions;
	}
}

export default defineLedgerBackend((config: FilePathLedgerOptions) => new FilePathLedgerBackend(config));
