import { beforeAll, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { TSCollector } from '@maat-tools/collector-ts';
import { coaTechnical } from '@maat-tools/connascence-rules';
import type { Finding } from '@maat-tools/contracts';
import { Kernel } from '@maat-tools/kernel';
import { tsAlgorithmicPatterns } from '@maat-tools/presets-ts';

const FIXTURE_DIR = resolve(import.meta.dir, '../fixtures/coa');
const FIXTURE_TSCONFIG = resolve(FIXTURE_DIR, 'tsconfig.json');

let findings: Finding[];

beforeAll(async () => {
	const originalCwd = process.cwd();
	process.chdir(FIXTURE_DIR);
	try {
		const kernel = new Kernel();
		kernel.registerCollector(
			new TSCollector({
				tsConfigFilePath: FIXTURE_TSCONFIG,
				algorithmicPatterns: tsAlgorithmicPatterns,
			}),
		);
		kernel.registerRule(
			coaTechnical({
				minFiles: 1,
				requireCompletePair: true,
			}),
		);
		const result = await kernel.run();
		findings = result.findings;
	} finally {
		process.chdir(originalCwd);
	}
});

function findingsFor(ruleId: string) {
	return findings.filter((f) => f.ruleId === ruleId);
}

function hasFinding(ruleId: string, match: string) {
	return findings.some((f) => f.ruleId === ruleId && f.message.includes(match));
}

describe('connascence-rules e2e — coa-technical with dedicated fixture', () => {
	const COA_RULE = 'coa-technical@v1';

	test('pack-unpack pattern with ":" is detected in cache.ts', () => {
		expect(hasFinding(COA_RULE, 'pack-unpack')).toBe(true);
		expect(hasFinding(COA_RULE, ':')).toBe(true);
	});

	test('file-encoding pattern with "utf-8" is detected across persistence.ts', () => {
		expect(hasFinding(COA_RULE, 'file-encoding')).toBe(true);
		expect(hasFinding(COA_RULE, 'utf-8')).toBe(true);
	});

	test('protocol pattern with "\\n" as separator is detected in protocol.ts', () => {
		expect(hasFinding(COA_RULE, 'pack-unpack')).toBe(true);
		expect(hasFinding(COA_RULE, '\\n')).toBe(true);
	});

	test('whitespace prefix/suffix in template literals is not reported', () => {
		// prefix.ts has `\n${heading}` — should NOT produce a finding
		// suffix.ts has `${text}\n` — should NOT produce a finding
		const prefixFinding = findings.find(
			(f) =>
				f.ruleId === COA_RULE &&
				f.artifacts.some(
					(a) => a.kind === 'algorithmicBinding' && (a.data as { file: string }).file.includes('prefix'),
				),
		);
		const suffixFinding = findings.find(
			(f) =>
				f.ruleId === COA_RULE &&
				f.artifacts.some(
					(a) => a.kind === 'algorithmicBinding' && (a.data as { file: string }).file.includes('suffix'),
				),
		);
		expect(prefixFinding).toBeUndefined();
		expect(suffixFinding).toBeUndefined();
	});

	test('coa-technical produces exactly 3 findings', () => {
		expect(findingsFor(COA_RULE)).toHaveLength(3);
	});
});
