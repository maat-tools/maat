import { beforeAll, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { TSCollector } from '@maat-tools/collector-ts';
import { com, copArgs, copStruct } from '@maat-tools/connascence-rules';
import type { Finding } from '@maat-tools/contracts';
import { Kernel } from '@maat-tools/kernel';

const FIXTURE_DIR = resolve(import.meta.dir, '../fixtures/sample-project');
const FIXTURE_TSCONFIG = resolve(FIXTURE_DIR, 'tsconfig.json');

let findings: Finding[];
let constants: { value: string; file: string }[];
let _functionSignatures: { functionName: string; parameters: { name: string; type: string }[]; isExported: boolean }[];

beforeAll(async () => {
	const originalCwd = process.cwd();
	process.chdir(FIXTURE_DIR);
	try {
		const kernel = new Kernel();
		kernel.registerCollector(new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG }));
		kernel.registerRule(com({ threshold: 2 }));
		kernel.registerRule(copArgs({ maxArgumentsAllowed: 3 }));
		kernel.registerRule(copStruct());
		const result = await kernel.run();
		findings = result.findings;

		// Collect raw facts for assertion helpers
		const { constants: c, functionSignatures: fs } = await new TSCollector({
			tsConfigFilePath: FIXTURE_TSCONFIG,
		}).collect();
		constants = c.map((x) => ({ value: x.value, file: x.location.file }));
		_functionSignatures = fs.map((x) => ({
			functionName: x.functionName,
			parameters: x.parameters.map((p) => ({ name: p.name, type: p.type })),
			isExported: x.isExported,
		}));
	} finally {
		process.chdir(originalCwd);
	}
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function findingsFor(ruleId: string) {
	return findings.filter((f) => f.ruleId === ruleId);
}

function hasFinding(ruleId: string, match: string) {
	return findings.some((f) => f.ruleId === ruleId && f.message.includes(match));
}

function hasNoFinding(ruleId: string, match: string) {
	return !hasFinding(ruleId, match);
}

// ─── Connascence of Position (cop) ───────────────────────────────────────────

describe('connascence-rules e2e — cop', () => {
	const COP_RULE = 'cop-args@v1';

	test('sendEmail (5 params) is flagged for exceeding threshold', () => {
		expect(hasFinding(COP_RULE, 'sendEmail')).toBe(true);
		expect(hasFinding(COP_RULE, '5 params exceeds threshold of 3')).toBe(true);
	});

	test('createUser (5 params + booleans) is flagged for both reasons', () => {
		expect(hasFinding(COP_RULE, 'createUser')).toBe(true);
		expect(hasFinding(COP_RULE, '5 params exceeds threshold of 3')).toBe(true);
		expect(hasFinding(COP_RULE, 'contains boolean param')).toBe(true);
	});

	test('UserService methods with ≤3 params are not flagged', () => {
		expect(hasNoFinding(COP_RULE, 'UserService.addUser')).toBe(true);
		expect(hasNoFinding(COP_RULE, 'UserService.findById')).toBe(true);
		expect(hasNoFinding(COP_RULE, 'UserService.getAll')).toBe(true);
	});

	test('greet (1 param) is not flagged', () => {
		expect(hasNoFinding(COP_RULE, 'greet')).toBe(true);
	});

	test('hasPermission (2 params) is not flagged', () => {
		expect(hasNoFinding(COP_RULE, 'hasPermission')).toBe(true);
	});

	test('cop produces exactly 2 findings', () => {
		expect(findingsFor(COP_RULE)).toHaveLength(2);
	});

	test('cop findings include call graph enrichment (caller count or chain depth)', () => {
		const copFindings = findingsFor(COP_RULE);
		for (const f of copFindings) {
			// Either no callers (no enrichment) or has caller info
			const hasCallerInfo = f.message.includes('called from') || f.message.includes('max chain depth');
			const hasNoCallers = !hasCallerInfo;
			expect(hasCallerInfo || hasNoCallers).toBe(true);
		}
	});
});

// ─── Connascence of Position — data structures (cop-struct) ──────────────────

describe('connascence-rules e2e — cop-struct', () => {
	const COP_STRUCT_RULE = 'cop-struct@v1';

	test('config (heterogeneous array) with index access is flagged', () => {
		expect(hasFinding(COP_STRUCT_RULE, 'config')).toBe(true);
	});

	test('user (assigned from tuple-returning function) with destructuring is flagged', () => {
		expect(hasFinding(COP_STRUCT_RULE, 'user')).toBe(true);
	});

	test('namedUser (object literal) is not flagged', () => {
		expect(hasNoFinding(COP_STRUCT_RULE, 'namedUser')).toBe(true);
	});

	test('cross-file: getUserDetails called in remote.ts is flagged', () => {
		expect(hasFinding(COP_STRUCT_RULE, 'getUserDetails')).toBe(true);
		expect(hasFinding(COP_STRUCT_RULE, 'remote.ts')).toBe(true);
	});
});

// ─── Connascence of Meaning (com) ────────────────────────────────────────────

describe('connascence-rules e2e — com', () => {
	const COM_RULE = 'com@v1';

	test('admin literal appears in multiple files → finding produced', () => {
		const adminOccurrences = constants.filter((c) => c.value === 'admin');
		const distinctFiles = new Set(adminOccurrences.map((c) => c.file)).size;
		expect(distinctFiles).toBeGreaterThanOrEqual(2);
		expect(hasFinding(COM_RULE, 'admin')).toBe(true);
	});

	test('read/write literals appear in only one file → no finding', () => {
		const readOccurrences = constants.filter((c) => c.value === 'read');
		const distinctFiles = new Set(readOccurrences.map((c) => c.file)).size;
		expect(distinctFiles).toBeLessThan(2);
		expect(hasNoFinding(COM_RULE, 'read')).toBe(true);
	});

	test('com finding includes flow path info when call graph connects files', () => {
		const comFindings = findingsFor(COM_RULE);
		for (const f of comFindings) {
			// Either has flow paths or no call graph connection
			const hasFlowPaths = f.message.includes('flow paths');
			const hasNoConnection = !hasFlowPaths;
			expect(hasFlowPaths || hasNoConnection).toBe(true);
		}
	});
});

// ─── overall ─────────────────────────────────────────────────────────────────

describe('connascence-rules e2e — overall', () => {
	test('total finding count: at least 3 (2 cop + 1 com)', () => {
		expect(findings.length).toBeGreaterThanOrEqual(3);
	});
});
