import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function workerPath(): string {
	const dir = dirname(fileURLToPath(import.meta.url));
	const js = join(dir, 'spinner-worker.js');

	return existsSync(js) ? js : join(dir, 'spinner-worker.ts');
}

export type Spinner = ReturnType<typeof createSpinner>;

export function createSpinner() {
	if (!process.stderr.isTTY) {
		return null;
	}

	const proc = spawn(process.execPath, [workerPath()], {
		stdio: ['pipe', 'ignore', 'inherit'],
	});

	return {
		update(text: string) {
			proc.stdin?.write(`${text}\n`);
		},
		stop() {
			proc.kill('SIGTERM');
			process.stderr.write('\r\x1b[K');
		},
	};
}
