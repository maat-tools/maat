import { resolve } from 'node:path';

const MONOREPO_ROOT = resolve(import.meta.dir, '../../../../');
const CLI_ENTRY = resolve(MONOREPO_ROOT, 'packages/cli/src/index.ts');

export interface CliResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export interface RunCliOptions {
	config: string;
	env?: Record<string, string>;
}

export function runCli(args: string[], options: RunCliOptions): CliResult {
	const proc = Bun.spawnSync(['bun', 'run', CLI_ENTRY, ...args, '--config', options.config], {
		cwd: MONOREPO_ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
		env: { ...process.env, ...options.env },
	});

	return {
		exitCode: proc.exitCode ?? 0,
		stdout: proc.stdout.toString(),
		stderr: proc.stderr.toString(),
	};
}
