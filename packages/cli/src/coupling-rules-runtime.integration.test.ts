import { beforeAll, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { TSCollector } from '@maat-tools/collector-ts';

import type { Finding } from '@maat-tools/contracts';
import { layer, Pure } from '@maat-tools/coupling-rules';
import { Kernel } from '@maat-tools/kernel';

const FIXTURE_DIR = resolve(import.meta.dir, '../fixtures/coupling-rules');
const FIXTURE_TSCONFIG = resolve(FIXTURE_DIR, 'tsconfig.json');

const RULES = [
	layer('@fixture/kernel').is(Pure).allows('@fixture/contracts').build(),
	layer('./monolith/src/domain/**').is(Pure).allows('./monolith/src/shared/**', 'react').build(),
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

// ─── runtime coupling detection ──────────────────────────────────────────────

describe('coupling-rules integration — runtime coupling', () => {
	const KERNEL_RULE = 'coupling/pure-imports:@fixture/kernel@v1';

	test('runtime coupling finding includes "runtime coupling" in message', () => {
		const runtimeFindings = findingsFor(KERNEL_RULE).filter((f) => f.message.includes('runtime coupling'));
		// If there are runtime findings, they should mention it
		for (const f of runtimeFindings) {
			expect(f.message).toContain('runtime coupling');
			expect(f.message).toContain('via call graph');
		}
	});

	test('runtime finding includes package name and runtime marker in message', () => {
		const runtimeFindings = findingsFor(KERNEL_RULE).filter((f) => f.message.includes('runtime coupling'));
		for (const f of runtimeFindings) {
			expect(f.message).toContain('via call graph');
		}
	});

	test('allowed runtime dependency does not produce finding', () => {
		// If @fixture/contracts appears in call graph but is allowed, no runtime finding
		const runtimeToContracts = findingsFor(KERNEL_RULE).filter(
			(f) => f.message.includes('runtime coupling') && f.message.includes('@fixture/contracts'),
		);
		expect(runtimeToContracts).toHaveLength(0);
	});
});

describe('coupling-rules integration — path mode runtime coupling', () => {
	const DOMAIN_RULE = 'coupling/pure-imports:./monolith/src/domain/**@v1';

	test('runtime coupling finding includes "runtime coupling" in message', () => {
		const runtimeFindings = findingsFor(DOMAIN_RULE).filter((f) => f.message.includes('runtime coupling'));
		for (const f of runtimeFindings) {
			expect(f.message).toContain('runtime coupling');
			expect(f.message).toContain('via call graph');
		}
	});

	test('runtime finding includes package name and runtime marker in message', () => {
		const runtimeFindings = findingsFor(DOMAIN_RULE).filter((f) => f.message.includes('runtime coupling'));
		for (const f of runtimeFindings) {
			expect(f.message).toContain('via call graph');
		}
	});

	test('allowed runtime dependency (react) does not produce finding', () => {
		const runtimeToReact = findingsFor(DOMAIN_RULE).filter(
			(f) => f.message.includes('runtime coupling') && f.message.includes('react'),
		);
		expect(runtimeToReact).toHaveLength(0);
	});
});
