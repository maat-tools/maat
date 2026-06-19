import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runCli } from '@maat-tools/testing';

const SMART_COLLECTION_CONFIG = resolve(import.meta.dir, '../fixtures/smart-collection/maat.config.ts');
const TIMEOUT = 30_000;

describe('maat check — smart collector fact selection', () => {
	let tmpDir: string;
	let logPath: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), 'maat-smart-'));
		logPath = join(tmpDir, 'required-facts.json');
		await writeFile(logPath, '[]', 'utf-8');
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	test(
		'collector receives only the facts declared by the configured rules',
		async () => {
			const result = runCli(['check'], {
				config: SMART_COLLECTION_CONFIG,
				env: { MAAT_SMART_COLLECTION_LOG: logPath },
			});

			expect(result.exitCode).toBe(1);
			expect(result.stdout).toContain('found constant: hello-smart-collection');

			const requiredFacts = JSON.parse(await Bun.file(logPath).text()) as string[];
			expect(requiredFacts).toEqual(['constants']);
		},
		TIMEOUT,
	);
});
