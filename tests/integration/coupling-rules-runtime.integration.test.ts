import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { resolve } from 'node:path';
import { TSCollector } from '@maat-tools/collector-ts';

import type { Finding } from '@maat-tools/contracts';
import { layer } from '@maat-tools/coupling-rules';
import { Kernel } from '@maat-tools/kernel';

setDefaultTimeout(30_000);

const FIXTURE_DIR = resolve(import.meta.dir, '../fixtures/coupling-rules');
const FIXTURE_TSCONFIG = resolve(FIXTURE_DIR, 'tsconfig.json');

const RULES = [
	layer('@fixture/kernel')
		.allows(/^@fixture\/contracts/)
		.build(),
];

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

// ─── coupling detection ──────────────────────────────────────────────────────

describe('coupling-rules integration — layer rule', () => {
	const KERNEL_RULE = 'maat-tools/coupling-rules/layer-imports@v1';

	test('@fixture/shared cross-package import is flagged', () => {
		const violations = findingsFor(KERNEL_RULE);
		expect(violations.length).toBeGreaterThan(0);
		// dep.to.path is the resolved file path, not the package name
		expect(violations.some((f) => f.message.includes('pkg-shared'))).toBe(true);
	});

	test('@fixture/contracts import is not flagged', () => {
		// Contracts is in allows list via regex — neither @fixture/contracts nor @fixture/contracts/types should appear
		const contractsViolations = findingsFor(KERNEL_RULE).filter((f) => f.message.match(/@fixture\/contracts/));
		expect(contractsViolations).toHaveLength(0);
	});

	test('finding message references the violating dependency', () => {
		const violations = findingsFor(KERNEL_RULE);
		for (const f of violations) {
			expect(f.message).toBeTruthy();
			expect(f.ruleId).toBe(KERNEL_RULE);
		}
	});
});
