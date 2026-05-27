import type { MaatConfig } from '@maat-tools/core';
import { findMaatConfig, getCurrentDir, getDirname, importFileDynamically, resolvePath } from '@maat-tools/utils';

type Env = Record<string, string | undefined>;

export const CONFIG_FILENAMES = [
	'maat.config.ts',
	'maat.config.mts',
	'maat.config.cts',
	'maat.config.js',
	'maat.config.mjs',
	'maat.config.cjs',
];

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

export function readConfigPathFromArgv(argv: string[]): string | undefined {
	for (const [i, arg] of argv.entries()) {
		if (arg === '--') {
			return;
		}

		if (arg === '--config' || arg === '-c') {
			const value = argv[i + 1];
			if (!value) {
				throw new Error(`${arg} requires a path.`);
			}

			return value;
		}

		if (arg.startsWith('--config=')) {
			const value = arg.slice('--config='.length);
			if (!value) {
				throw new Error('--config requires a path.');
			}

			return value;
		}
	}
}

async function importMaatConfig(filePath: string): Promise<MaatConfig> {
	const { default: config } = await importFileDynamically<{ default: MaatConfig }>({ filePath, asDefault: true });

	validateConfig(config, filePath);

	return config;
}

async function validateConfig(value: unknown, filePath: string) {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const obj = value as Record<string, unknown>;

	if (!Array.isArray(obj.collectors) || !Array.isArray(obj.rules)) {
		throw new Error(`Maat config at ${filePath} must default export a config with collectors and rules arrays.`);
	}
}

export async function loadMaatConfig(options: LoadMaatConfigOptions = {}): Promise<LoadedMaatConfig> {
	const cwd = options.cwd ?? getCurrentDir();
	const argv = options.argv ?? process.argv.slice(2);
	const env = options.env ?? process.env;

	const cliConfigPath = readConfigPathFromArgv(argv);
	const envConfigPath = env.MAAT_CONFIG;
	const explicitConfigPath = cliConfigPath ?? envConfigPath;

	if (explicitConfigPath) {
		const filePath = await resolvePath(explicitConfigPath, cwd);

		return {
			config: await importMaatConfig(filePath),
			filePath,
			rootDir: getDirname(filePath),
			source: cliConfigPath ? 'cli' : 'env',
		};
	}

	const filePath = await findMaatConfig(cwd, CONFIG_FILENAMES);
	if (!filePath) {
		throw new Error(`No maat config found. Add ${CONFIG_FILENAMES[0]} or pass --config <path>.`);
	}

	return {
		config: await importMaatConfig(filePath),
		filePath,
		rootDir: getDirname(filePath),
		source: 'auto',
	};
}
