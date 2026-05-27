import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FilePathLedgerBackend } from '@maat-tools/file-ledger';

export class LedgerHarness {
	dir!: string;
	path!: string;
	backend!: FilePathLedgerBackend;

	async setup(): Promise<void> {
		this.dir = join(tmpdir(), `maat-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(this.dir, { recursive: true });
		this.path = join(this.dir, 'ledger.ndjson');
		this.backend = new FilePathLedgerBackend({ path: this.path });
		await this.backend.initialize();
	}

	async teardown(): Promise<void> {
		await rm(this.dir, { recursive: true, force: true });
	}
}
