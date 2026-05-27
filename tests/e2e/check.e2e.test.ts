import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { runCli } from '@maat-tools/testing';

const SAMPLE_CONFIG = resolve(import.meta.dir, '../fixtures/sample-project/maat.config.ts');

describe('maat check — sample project', () => {
	test('exits 1 when violations are found (strict mode default)', () => {
		const result = runCli(['check'], { config: SAMPLE_CONFIG });
		expect(result.exitCode).toBe(1);
	});

	test('stdout reports cop-args violation', () => {
		const result = runCli(['check'], { config: SAMPLE_CONFIG });
		expect(result.stdout).toContain('cop-args');
	});

	test('stdout reports com violation', () => {
		const result = runCli(['check'], { config: SAMPLE_CONFIG });
		expect(result.stdout).toContain('com');
	});

	test('--silent suppresses stdout but exit code still reflects violations', () => {
		const result = runCli(['check', '--silent'], { config: SAMPLE_CONFIG });
		expect(result.exitCode).toBe(1);
		expect(result.stdout.trim()).toBe('');
	});

	test('--show findings omits insights section', () => {
		const result = runCli(['check', '--show', 'findings'], { config: SAMPLE_CONFIG });
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain('cop-args');
	});
});
