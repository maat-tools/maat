import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMaatConfig, readConfigPathFromArgv } from './config';

let dir: string | undefined;

async function makeDir(): Promise<string> {
	dir = await mkdtemp(join(tmpdir(), 'maat-cli-config-'));
	return dir;
}

async function writeConfig(
	root: string,
	filename: string,
	collectorId = 'test-collector',
): Promise<string> {
	const filePath = join(root, filename);
	await writeFile(
		filePath,
		`export default { collectors: ['${collectorId}'], rules: [] };`,
	);
	return filePath;
}

afterEach(async () => {
	if (dir) {
		await rm(dir, { recursive: true, force: true });
		dir = undefined;
	}
});

describe('loadMaatConfig', () => {
	test('loads an explicit --config path', async () => {
		const root = await makeDir();
		const configPath = await writeConfig(root, 'custom.config.ts');

		const loaded = await loadMaatConfig({
			argv: ['--config', 'custom.config.ts'],
			cwd: root,
			env: {},
		});

		expect(loaded.source).toBe('cli');
		expect(loaded.filePath).toBe(configPath);
		expect(loaded.rootDir).toBe(root);
		expect(loaded.config.collectors).toEqual(['test-collector']);
	});

	test('loads --config=path', async () => {
		const root = await makeDir();
		const configPath = await writeConfig(root, 'custom.config.ts');

		const loaded = await loadMaatConfig({
			argv: ['--config=custom.config.ts'],
			cwd: root,
			env: {},
		});

		expect(loaded.source).toBe('cli');
		expect(loaded.filePath).toBe(configPath);
	});

	test('loads MAAT_CONFIG when no CLI config is provided', async () => {
		const root = await makeDir();
		const configPath = await writeConfig(root, 'env.config.ts');

		const loaded = await loadMaatConfig({
			argv: [],
			cwd: root,
			env: { MAAT_CONFIG: configPath },
		});

		expect(loaded.source).toBe('env');
		expect(loaded.filePath).toBe(configPath);
	});

	test('prefers --config over MAAT_CONFIG', async () => {
		const root = await makeDir();
		const cliConfigPath = await writeConfig(root, 'cli.config.ts', 'cli');
		const envConfigPath = await writeConfig(root, 'env.config.ts', 'env');

		const loaded = await loadMaatConfig({
			argv: ['-c', cliConfigPath],
			cwd: root,
			env: { MAAT_CONFIG: envConfigPath },
		});

		expect(loaded.source).toBe('cli');
		expect(loaded.filePath).toBe(cliConfigPath);
		expect(loaded.config.collectors).toEqual(['cli']);
	});

	test('discovers maat.config.ts from ancestor directories', async () => {
		const root = await makeDir();
		const configPath = await writeConfig(root, 'maat.config.ts');
		const nested = join(root, 'packages', 'app', 'src');
		await mkdir(nested, { recursive: true });

		const loaded = await loadMaatConfig({
			argv: [],
			cwd: nested,
			env: {},
		});

		expect(loaded.source).toBe('auto');
		expect(loaded.filePath).toBe(configPath);
		expect(loaded.rootDir).toBe(root);
	});
});

describe('readConfigPathFromArgv', () => {
	test('requires a path for --config', () => {
		expect(() => readConfigPathFromArgv(['--config'])).toThrow(
			'--config requires a path.',
		);
	});
});
