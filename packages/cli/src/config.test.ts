import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMaatConfig, readConfigPathFromArgv } from './config';

let dir: string;

async function writeConfig(root: string, filename: string, collectorId = 'test-collector'): Promise<string> {
	const filePath = join(root, filename);
	await writeFile(filePath, `export default { collectors: ['${collectorId}'], rules: [] };`);
	return filePath;
}

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'maat-cli-config-'));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe('readConfigPathFromArgv', () => {
	test('--config requires a path argument', () => {
		expect(() => readConfigPathFromArgv(['--config'])).toThrow('--config requires a path.');
	});

	test('-c requires a path argument', () => {
		expect(() => readConfigPathFromArgv(['-c'])).toThrow('-c requires a path.');
	});

	test('returns undefined when no config flag present', () => {
		expect(readConfigPathFromArgv(['--strict', '--show', 'all'])).toBeUndefined();
	});

	test('stops parsing at --', () => {
		expect(readConfigPathFromArgv(['--', '--config', 'something.ts'])).toBeUndefined();
	});
});

describe('loadMaatConfig', () => {
	test('loads an explicit --config path', async () => {
		const configPath = await writeConfig(dir, 'custom.config.ts');
		const loaded = await loadMaatConfig({ argv: ['--config', 'custom.config.ts'], cwd: dir, env: {} });
		expect(loaded.source).toBe('cli');
		expect(loaded.filePath).toBe(configPath);
		expect(loaded.rootDir).toBe(dir);
		expect(loaded.config.collectors as unknown[]).toEqual(['test-collector']);
	});

	test('loads --config=path (equals-sign form)', async () => {
		const configPath = await writeConfig(dir, 'custom.config.ts');
		const loaded = await loadMaatConfig({ argv: ['--config=custom.config.ts'], cwd: dir, env: {} });
		expect(loaded.source).toBe('cli');
		expect(loaded.filePath).toBe(configPath);
	});

	test('loads -c short form', async () => {
		const configPath = await writeConfig(dir, 'custom.config.ts');
		const loaded = await loadMaatConfig({ argv: ['-c', 'custom.config.ts'], cwd: dir, env: {} });
		expect(loaded.source).toBe('cli');
		expect(loaded.filePath).toBe(configPath);
	});

	test('loads MAAT_CONFIG env var when no CLI config', async () => {
		const configPath = await writeConfig(dir, 'env.config.ts');
		const loaded = await loadMaatConfig({ argv: [], cwd: dir, env: { MAAT_CONFIG: configPath } });
		expect(loaded.source).toBe('env');
		expect(loaded.filePath).toBe(configPath);
	});

	test('--config takes precedence over MAAT_CONFIG', async () => {
		const cliConfigPath = await writeConfig(dir, 'cli.config.ts', 'cli-collector');
		const envConfigPath = await writeConfig(dir, 'env.config.ts', 'env-collector');
		const loaded = await loadMaatConfig({
			argv: ['-c', cliConfigPath],
			cwd: dir,
			env: { MAAT_CONFIG: envConfigPath },
		});
		expect(loaded.source).toBe('cli');
		expect(loaded.filePath).toBe(cliConfigPath);
		expect(loaded.config.collectors as unknown[]).toEqual(['cli-collector']);
	});

	test('auto-discovers maat.config.ts from ancestor directories', async () => {
		const configPath = await writeConfig(dir, 'maat.config.ts');
		const nested = join(dir, 'packages', 'app', 'src');
		await mkdir(nested, { recursive: true });
		const loaded = await loadMaatConfig({ argv: [], cwd: nested, env: {} });
		expect(loaded.source).toBe('auto');
		expect(loaded.filePath).toBe(configPath);
		expect(loaded.rootDir).toBe(dir);
	});

	test('throws when explicit config file does not exist', async () => {
		await expect(loadMaatConfig({ argv: ['--config', 'does-not-exist.ts'], cwd: dir, env: {} })).rejects.toThrow(
			'File not found',
		);
	});

	test('throws when no config is found anywhere', async () => {
		await expect(loadMaatConfig({ argv: [], cwd: dir, env: {} })).rejects.toThrow('No maat config found');
	});
});
