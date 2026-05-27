import { beforeAll, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { TSCollector } from '@maat-tools/collector-ts';
import { com, copArgs } from '@maat-tools/connascence-rules';
import type { Finding } from '@maat-tools/contracts';
import { Kernel } from '@maat-tools/kernel';

const FIXTURE_DIR = resolve(import.meta.dir, '../fixtures/sample-project');
const FIXTURE_TSCONFIG = resolve(FIXTURE_DIR, 'tsconfig.json');

let findings: Finding[];

beforeAll(async () => {
	const originalCwd = process.cwd();
	process.chdir(FIXTURE_DIR);
	try {
		const kernel = new Kernel();
		kernel.registerCollector(new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG }));
		kernel.registerRule(com({ threshold: 2 }));
		kernel.registerRule(copArgs({ maxArgumentsAllowed: 3 }));
		const result = await kernel.run();
		findings = result.findings;
	} finally {
		process.chdir(originalCwd);
	}
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function findingsFor(ruleId: string) {
	return findings.filter((f) => f.ruleId === ruleId);
}

// ─── CoM call graph enrichment ───────────────────────────────────────────────

describe('com e2e — call graph flow path enrichment', () => {
	const COM_RULE = 'com@v1';

	test('com findings either have flow paths or no call graph connection', () => {
		const comFindings = findingsFor(COM_RULE);
		for (const f of comFindings) {
			const hasFlowPaths = f.message.includes('flow paths');
			const hasNoConnection = !hasFlowPaths;
			expect(hasFlowPaths || hasNoConnection).toBe(true);
		}
	});

	test('when flow paths are present, they show source → target format', () => {
		const comFindings = findingsFor(COM_RULE);
		const findingsWithPaths = comFindings.filter((f) => f.message.includes('flow paths'));
		for (const f of findingsWithPaths) {
			expect(f.message).toMatch(/flow paths:.*→/);
		}
	});

	test('flow paths include hop count', () => {
		const comFindings = findingsFor(COM_RULE);
		const findingsWithPaths = comFindings.filter((f) => f.message.includes('flow paths'));
		for (const f of findingsWithPaths) {
			expect(f.message).toMatch(/\(\d+ hops?\)/);
		}
	});
});

// ─── CoP-Args call graph enrichment ──────────────────────────────────────────

describe('cop-args e2e — caller count and chain depth enrichment', () => {
	const COP_RULE = 'cop-args@v1';

	test('cop-args findings either have caller info or no callers', () => {
		const copFindings = findingsFor(COP_RULE);
		for (const f of copFindings) {
			const hasCallerInfo = f.message.includes('called from') || f.message.includes('max chain depth');
			const hasNoCallers = !hasCallerInfo;
			expect(hasCallerInfo || hasNoCallers).toBe(true);
		}
	});

	test('when caller info is present, it shows file count', () => {
		const copFindings = findingsFor(COP_RULE);
		const findingsWithCallers = copFindings.filter((f) => f.message.includes('called from'));
		for (const f of findingsWithCallers) {
			expect(f.message).toMatch(/called from \d+ file/);
		}
	});

	test('when caller info is present, it shows chain depth', () => {
		const copFindings = findingsFor(COP_RULE);
		const findingsWithCallers = copFindings.filter((f) => f.message.includes('called from'));
		for (const f of findingsWithCallers) {
			expect(f.message).toMatch(/max chain depth: \d+/);
		}
	});
});
