import { access } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MaatConfig } from '@maat/core';

type Env = Record<string, string | undefined>;

export const CONFIG_FILENAMES = [
	'maat.config.ts',
	'maat.config.mts',
	'maat.config.cts',
	'maat.config.js',
	'maat.config.mjs',
	'maat.config.cjs',
] as const;

export type ConfigSource = 'cli' | 'env' | 'auto';

export type LoadedMaatConfig = {
	config: MaatConfig;
	filePath: string;
	rootDir: string;
	source: ConfigSource;
};

export type LoadMaatConfigOptions = {
	argv?: string[];
	cwd?: string;
	env?: Env;
};

export async function loadMaatConfig(
	options: LoadMaatConfigOptions = {},
): Promise<LoadedMaatConfig> {
	const cwd = resolve(options.cwd ?? process.cwd());
	const argv = options.argv ?? process.argv.slice(2);
	const env = options.env ?? process.env;

	const cliConfigPath = readConfigPathFromArgv(argv);
	const envConfigPath = env.MAAT_CONFIG;
	const explicitConfigPath = cliConfigPath ?? envConfigPath;

	if (explicitConfigPath) {
		const filePath = resolveConfigPath(explicitConfigPath, cwd);
		await assertConfigExists(filePath);
		return {
			config: await importMaatConfig(filePath),
			filePath,
			rootDir: dirname(filePath),
			source: cliConfigPath ? 'cli' : 'env',
		};
	}

	const filePath = await findMaatConfig(cwd);
	if (!filePath) {
		throw new Error(
			`No maat config found. Add ${CONFIG_FILENAMES[0]} or pass --config <path>.`,
		);
	}

	return {
		config: await importMaatConfig(filePath),
		filePath,
		rootDir: dirname(filePath),
		source: 'auto',
	};
}

export async function findMaatConfig(cwd: string): Promise<string | null> {
	let currentDir = resolve(cwd);

	while (true) {
		for (const filename of CONFIG_FILENAMES) {
			const candidate = join(currentDir, filename);
			if (await pathExists(candidate)) {
				return candidate;
			}
		}

		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) {
			return null;
		}
		currentDir = parentDir;
	}
}

export function readConfigPathFromArgv(argv: string[]): string | undefined {
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--') {
			return undefined;
		}
		if (arg === '--config' || arg === '-c') {
			const value = argv[i + 1];
			if (!value) {
				throw new Error(`${arg} requires a path.`);
			}
			return value;
		}
		if (arg?.startsWith('--config=')) {
			const value = arg.slice('--config='.length);
			if (!value) {
				throw new Error('--config requires a path.');
			}
			return value;
		}
	}

	return undefined;
}

function resolveConfigPath(configPath: string, cwd: string): string {
	return isAbsolute(configPath) ? configPath : resolve(cwd, configPath);
}

async function assertConfigExists(filePath: string): Promise<void> {
	if (!(await pathExists(filePath))) {
		throw new Error(`Maat config file not found: ${filePath}`);
	}
}

async function importMaatConfig(filePath: string): Promise<MaatConfig> {
	let mod: { default?: unknown };
	try {
		mod = await import(pathToFileURL(filePath).href);
	} catch (error) {
		throw new Error(
			`Failed to load Maat config at ${filePath}: ${formatError(error)}`,
		);
	}

	const config = mod.default;
	if (!isMaatConfig(config)) {
		throw new Error(
			`Maat config at ${filePath} must default export a config with collectors and rules arrays.`,
		);
	}

	return config;
}

function isMaatConfig(value: unknown): value is MaatConfig {
	return (
		typeof value === 'object' &&
		value !== null &&
		Array.isArray((value as { collectors?: unknown }).collectors) &&
		Array.isArray((value as { rules?: unknown }).rules)
	);
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);

		return true;
	} catch {
		return false;
	}
}

function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
