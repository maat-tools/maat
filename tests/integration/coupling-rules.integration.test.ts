import { beforeAll, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { TSCollector } from '@maat-tools/collector-ts';

import type { Finding } from '@maat-tools/contracts';
import { layer } from '@maat-tools/coupling-rules';
import { Kernel } from '@maat-tools/kernel';

const FIXTURE_DIR = resolve(import.meta.dir, '../fixtures/coupling-rules');
const FIXTURE_TSCONFIG = resolve(FIXTURE_DIR, 'tsconfig.json');

const RULES = [
	// pkg-kernel may only depend on @fixture/contracts (and sub-paths via regex)
	layer('@fixture/kernel')
		.allows(/^@fixture\/contracts/)
		.build(),
];

const RULE_ID = 'maat-tools/coupling-rules/layer-imports@v1';

let findings: Finding[];

beforeAll(async () => {
	const originalCwd = process.cwd();
	process.chdir(FIXTURE_DIR);
	try {
		const kernel = new Kernel();
		kernel.registerCollector(new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG }));
		for (const rule of RULES) {
			kernel.registerRule(rule);
		}
		({ findings } = await kernel.run());
	} finally {
		process.chdir(originalCwd);
	}
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function findingsFor(ruleId: string) {
	return findings.filter((f) => f.ruleId === ruleId);
}

function kernelFindings() {
	return findingsFor(RULE_ID).filter((f) => f.message.includes('@fixture/kernel'));
}

// ─── package mode ─────────────────────────────────────────────────────────────

describe('coupling-rules integration — package mode', () => {
	test('there are findings from kernel rule', () => {
		expect(kernelFindings().length).toBeGreaterThan(0);
	});

	test('VIOLATION: cross-package import from pkg-shared is flagged', () => {
		// cross-pkg-blocked.ts imports ../../pkg-shared/src/index — stored as resolved path
		const blockedFindings = kernelFindings().filter((f) => f.message.includes('pkg-shared'));
		expect(blockedFindings.length).toBeGreaterThan(0);
	});

	test('allowed: @fixture/contracts imports (regex) do not produce findings', () => {
		// @fixture/contracts and @fixture/contracts/types should be allowed by /^@fixture\/contracts/
		const contractsViolations = kernelFindings().filter((f) => f.message.match(/@fixture\/contracts/));
		expect(contractsViolations).toHaveLength(0);
	});

	test('all findings carry the layer-imports rule id', () => {
		for (const f of findingsFor(RULE_ID)) {
			expect(f.ruleId).toBe(RULE_ID);
		}
	});
});

// ─── overall ─────────────────────────────────────────────────────────────────

describe('coupling-rules integration — overall', () => {
	test('at least one finding is produced across all rules', () => {
		expect(findings.length).toBeGreaterThan(0);
	});
});
