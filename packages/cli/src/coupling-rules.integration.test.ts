import { beforeAll, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { TSCollector } from '@maat-tools/collector-ts';
import type { Finding } from '@maat-tools/contracts';
import { layer, Pure } from '@maat-tools/coupling-rules';
import { Kernel } from '@maat-tools/kernel';

const FIXTURE_TSCONFIG = resolve(import.meta.dir, '../fixtures/coupling-rules/tsconfig.json');

const RULES = [
	// pkg-contracts may use node built-ins
	layer('@fixture/contracts').is(Pure).allows('node:crypto').build(),

	// pkg-kernel may only depend on @fixture/contracts — nothing else
	layer('@fixture/kernel').is(Pure).allows('@fixture/contracts').build(),

	// domain layer may only import from shared or react
	layer('./monolith/src/domain/**').is(Pure).allows('./monolith/src/shared/**', 'react').build(),
];

let findings: Finding[];

beforeAll(async () => {
	const kernel = new Kernel();
	kernel.registerCollector(new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG }));
	for (const rule of RULES) {
		kernel.registerRule(rule);
	}
	({ findings } = await kernel.run());
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function findingsFor(ruleId: string) {
	return findings.filter((f) => f.ruleId === ruleId);
}

function hasViolation(ruleId: string, file: string, specifier: string) {
	return findings.some((f) => f.ruleId === ruleId && f.message.includes(file) && f.message.includes(specifier));
}

function hasNoViolation(ruleId: string, file: string, specifier: string) {
	return !hasViolation(ruleId, file, specifier);
}

// ─── package mode ─────────────────────────────────────────────────────────────

describe('coupling-rules integration — package mode', () => {
	const KERNEL_RULE = 'coupling/pure-imports:@fixture/kernel@v1';
	const CONTRACTS_RULE = 'coupling/pure-imports:@fixture/contracts@v1';

	test('total findings from kernel rule: exactly 2', () => {
		expect(findingsFor(KERNEL_RULE)).toHaveLength(2);
	});

	test('VIOLATION: @fixture/kernel imports @fixture/core (not in allows)', () => {
		// package mode message: "@fixture/kernel" imports "@fixture/core" — ...
		expect(hasViolation(KERNEL_RULE, '@fixture/kernel', '@fixture/core')).toBe(true);
	});

	test('allowed: @fixture/kernel imports @fixture/contracts — no finding', () => {
		expect(hasNoViolation(KERNEL_RULE, 'pkg-kernel/src/index.ts', '@fixture/contracts')).toBe(true);
	});

	test('allowed: sub-path @fixture/contracts/types covered by @fixture/contracts allow entry — no finding', () => {
		expect(hasNoViolation(KERNEL_RULE, 'pkg-kernel/src/index.ts', '@fixture/contracts/types')).toBe(true);
	});

	test('allowed: relative ./utils import in pkg-kernel is skipped — no finding', () => {
		expect(hasNoViolation(KERNEL_RULE, 'pkg-kernel/src/index.ts', './utils')).toBe(true);
	});

	test('total findings from contracts rule: 0 (node:crypto is allowed)', () => {
		expect(findingsFor(CONTRACTS_RULE)).toHaveLength(0);
	});

	test('no transitive enforcement: @fixture/contracts importing node:crypto is not caught by the kernel rule', () => {
		// kernel only polices its own package — contracts' node:crypto is contracts' business
		expect(hasNoViolation(KERNEL_RULE, 'pkg-contracts/src/index.ts', 'node:crypto')).toBe(true);
	});

	test('VIOLATION: cross-package relative import normalized to @fixture/shared (not in allows)', () => {
		// cross-pkg-blocked.ts does ../../pkg-shared/src/index — collector rewrites to @fixture/shared
		// the raw relative specifier never reaches the rule
		expect(findings.every((f) => !f.message.includes('../../pkg-shared'))).toBe(true);
		expect(hasViolation(KERNEL_RULE, '@fixture/kernel', '@fixture/shared')).toBe(true);
	});

	test('allowed: cross-package relative import normalized to @fixture/contracts — no finding', () => {
		// cross-pkg-allowed.ts does ../../pkg-contracts/src/index — collector rewrites to @fixture/contracts
		// @fixture/contracts is in allows, so the normalized form produces no finding
		expect(findings.every((f) => !f.message.includes('../../pkg-contracts'))).toBe(true);
	});

	test('files from other packages are fully ignored by each rule', () => {
		// package mode message contains the target package name, not a file path
		const kernelFindings = findingsFor(KERNEL_RULE);
		for (const f of kernelFindings) {
			expect(f.message).toContain('@fixture/kernel');
		}
	});
});

// ─── path mode ────────────────────────────────────────────────────────────────

describe('coupling-rules integration — path mode', () => {
	const DOMAIN_RULE = 'coupling/pure-imports:./monolith/src/domain/**@v1';

	test('total findings from domain rule: exactly 4', () => {
		expect(findingsFor(DOMAIN_RULE)).toHaveLength(4);
	});

	test('VIOLATION: domain/service.ts → ../infrastructure/db (resolves outside allowed paths)', () => {
		expect(hasViolation(DOMAIN_RULE, 'monolith/src/domain/service.ts', '../infrastructure/db')).toBe(true);
	});

	test('VIOLATION: domain/service.ts → lodash (package not in allows)', () => {
		expect(hasViolation(DOMAIN_RULE, 'monolith/src/domain/service.ts', 'lodash')).toBe(true);
	});

	test('VIOLATION: domain/user/service.ts → ../../infrastructure/db (deeper file, same blocked destination)', () => {
		expect(hasViolation(DOMAIN_RULE, 'monolith/src/domain/user/service.ts', '../../infrastructure/db')).toBe(true);
	});

	test('allowed: ./helper import is same-directory — always skipped', () => {
		expect(hasNoViolation(DOMAIN_RULE, 'monolith/src/domain/service.ts', './helper')).toBe(true);
	});

	test('allowed: ../shared/auth resolves to monolith/src/shared/auth — matches ./monolith/src/shared/**', () => {
		expect(hasNoViolation(DOMAIN_RULE, 'monolith/src/domain/service.ts', '../shared/auth')).toBe(true);
	});

	test('allowed: ../../shared/auth from user/service.ts resolves to the same monolith/src/shared/auth', () => {
		expect(hasNoViolation(DOMAIN_RULE, 'monolith/src/domain/user/service.ts', '../../shared/auth')).toBe(true);
	});

	test('allowed: react is explicitly listed in allows — no finding', () => {
		expect(hasNoViolation(DOMAIN_RULE, 'monolith/src/domain/service.ts', 'react')).toBe(true);
	});

	test('VIOLATION: package name @fixture/shared does not match path glob ./monolith/src/shared/** — blocked', () => {
		// allows has './monolith/src/shared/**' (path glob) and 'react' (package name)
		// '@fixture/shared' is a package name — path globs never match package names
		expect(hasViolation(DOMAIN_RULE, 'monolith/src/domain/pkg-name-import.ts', '@fixture/shared')).toBe(true);
	});

	test('ignored: infrastructure/db.ts is outside the domain target — its imports never appear as findings', () => {
		const domainFindings = findingsFor(DOMAIN_RULE);
		for (const f of domainFindings) {
			expect(f.message).not.toContain('monolith/src/infrastructure/');
		}
	});

	test('ignored: shared/auth.ts is outside the domain target — not policed', () => {
		const domainFindings = findingsFor(DOMAIN_RULE);
		for (const f of domainFindings) {
			expect(f.message).not.toContain('monolith/src/shared/');
		}
	});
});

// ─── overall ─────────────────────────────────────────────────────────────────

describe('coupling-rules integration — overall', () => {
	test('total finding count across all rules: exactly 6', () => {
		expect(findings).toHaveLength(6);
	});
});
