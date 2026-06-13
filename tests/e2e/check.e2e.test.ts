import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { runCli, stripAnsi } from '@maat-tools/testing';

const SAMPLE_CONFIG = resolve(import.meta.dir, '../fixtures/sample-project/maat.config.ts');
const NON_STRICT_CONFIG = resolve(import.meta.dir, '../fixtures/sample-project/maat.config.nonstrict.ts');

describe('maat check — sample project', () => {
	test('exits 1 when violations are found (strict mode default)', () => {
		const result = runCli(['check'], { config: SAMPLE_CONFIG });
		expect(result.exitCode).toBe(1);
	});

	test('non-strict config → exits 0 even with violations', () => {
		const result = runCli(['check'], { config: NON_STRICT_CONFIG });
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('cop-args');
	});

	test('stdout reports cop-args violation', () => {
		const result = runCli(['check'], { config: SAMPLE_CONFIG });
		expect(result.stdout).toContain('cop-args');
	});

	test('stdout reports com violation', () => {
		const result = runCli(['check'], { config: SAMPLE_CONFIG });
		expect(result.stdout).toContain('com');
	});

	test('without ledger configured → run context reports ledger not configured', () => {
		const result = runCli(['check'], { config: SAMPLE_CONFIG });
		expect(stripAnsi(result.stdout)).toContain('RUN CONTEXT');
		expect(stripAnsi(result.stdout)).toContain('Ledger: not configured');
	});

	test('--ledger flag without ledger configured → exit 1 with error', () => {
		const result = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG });
		expect(result.exitCode).toBe(1);
		expect(stripAnsi(result.stderr)).toContain('Ledger option enabled');
	});

	test('--silent suppresses stdout but exit code still reflects violations', () => {
		const result = runCli(['check', '--silent'], { config: SAMPLE_CONFIG });
		expect(result.exitCode).toBe(1);
		expect(result.stdout.trim()).toBe('');
	});

	test('--show findings omits run context and insights sections', () => {
		const result = runCli(['check', '--show', 'findings'], { config: SAMPLE_CONFIG });
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain('cop-args');
		expect(stripAnsi(result.stdout)).not.toContain('RUN CONTEXT');
	});

	test('--show insights omits findings section', () => {
		const result = runCli(['check', '--show', 'insights'], { config: SAMPLE_CONFIG });
		expect(stripAnsi(result.stdout)).not.toContain('FINDINGS');
	});
});
