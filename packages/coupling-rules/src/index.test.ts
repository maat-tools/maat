import { describe, expect, test } from 'bun:test';
import { type BrandedRuleBuilder, isRule, isRuleBuilder, RULE_BUILDER_BRAND } from '@maat-tools/contracts';
import type { DependsOn } from '@maat-tools/vocabulary';
import { layer } from './layer';
import { Pure } from './roles';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeDep(
	fromPkg: string,
	toPath: string,
	opts: { fromPath?: string; fromRootPath?: string; toExternal?: boolean } = {},
): DependsOn {
	const fromRootPath = opts.fromRootPath ?? `packages/${fromPkg.split('/').pop()}`;
	const fromPath = opts.fromPath ?? `${fromRootPath}/src/index.ts`;

	return {
		from: {
			path: fromPath,
			package: { name: fromPkg, rootPath: fromRootPath },
			location: { file: fromPath, line: 1 },
		},
		to: {
			path: toPath,
			isExternal: opts.toExternal ?? true,
		},
	};
}

function makeFacts(deps: DependsOn[]) {
	return { dependsOn: deps };
}

// ─── layer() builder ─────────────────────────────────────────────────────────

describe('layer()', () => {
	test('initial builder is NOT a branded RuleBuilder (build() not yet available)', () => {
		const builder = layer('@maat-tools/kernel');
		expect(isRuleBuilder(builder)).toBe(false);
	});

	test('.is() returns a branded RuleBuilder', () => {
		const ready = layer('@maat-tools/kernel').is(Pure);
		expect(isRuleBuilder(ready)).toBe(true);
		expect((ready as unknown as BrandedRuleBuilder)[RULE_BUILDER_BRAND]).toBe(true);
	});

	test('.allows() returns a branded RuleBuilder', () => {
		const ready = layer('@maat-tools/kernel').allows('@maat-tools/contracts');
		expect(isRuleBuilder(ready)).toBe(true);
	});

	test('throws when target is empty', () => {
		expect(() => layer('')).toThrow('layer() requires a non-empty target');
	});

	test('throws when target is a relative path', () => {
		expect(() => layer('./src/**')).toThrow('layer() target cannot be a relative path');
		expect(() => layer('../src/**')).toThrow('layer() target cannot be a relative path');
	});

	test('.build() without .is() returns a LayerRule with correct id', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		expect(isRule(rule)).toBe(true);
		expect(rule.id).toBe('maat-tools/coupling-rules/layer-imports@v1');
		expect(rule.needFacts).toContain('dependsOn');
	});

	test('.is(Pure).build() returns a PureLayerRule with correct id', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).build();
		expect(isRule(rule)).toBe(true);
		expect(rule.id).toBe('maat-tools/coupling-rules/pure-imports@v1');
	});

	test('.allows() chains accumulate patterns', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').allows('@maat-tools/vocabulary').build();
		expect(isRule(rule)).toBe(true);
	});
});

// ─── LayerRule.evaluate() ─────────────────────────────────────────────────────

describe('LayerRule.evaluate() — allowlist', () => {
	test('no finding when dependency is in allows list', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/contracts')]));
		expect(findings).toHaveLength(0);
	});

	test('finding when dependency is NOT in allows list', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', 'uuid')]));
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('maat-tools/coupling-rules/layer-imports@v1');
	});

	test('no finding when source package does not match target', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/cli', 'uuid')]));
		expect(findings).toHaveLength(0);
	});

	test('allows() with empty list — any external dep is a finding', () => {
		const rule = layer('@maat-tools/contracts').allows().build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/contracts', 'node:crypto')]));
		expect(findings).toHaveLength(1);
	});

	test('string pattern does not match partial package name', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/contracts-extra')]));
		expect(findings).toHaveLength(1);
	});

	test('regexp pattern in allows list', () => {
		const rule = layer('@maat-tools/kernel')
			.allows(/^@maat-tools\//)
			.build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/contracts')]));
		expect(findings).toHaveLength(0);
	});

	test('regexp pattern — non-matching dependency is a finding', () => {
		const rule = layer('@maat-tools/kernel')
			.allows(/^@maat-tools\//)
			.build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', 'uuid')]));
		expect(findings).toHaveLength(1);
	});

	test('multiple deps — only disallowed ones produce findings', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts', '@maat-tools/core').build();
		const findings = rule.evaluate(
			makeFacts([
				makeDep('@maat-tools/kernel', '@maat-tools/contracts'),
				makeDep('@maat-tools/kernel', '@maat-tools/core'),
				makeDep('@maat-tools/kernel', 'uuid'),
				makeDep('@maat-tools/cli', 'uuid'), // different package — ignored
			]),
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ dependency: 'uuid' });
	});

	test('finding message includes target and dependency', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', 'uuid')]));
		expect(findings[0]?.message).toContain('@maat-tools/kernel');
		expect(findings[0]?.message).toContain('uuid');
	});
});

// ─── PureLayerRule.evaluate() ─────────────────────────────────────────────────

describe('PureLayerRule.evaluate()', () => {
	test('flags all external deps from target', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/contracts')]));
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('maat-tools/coupling-rules/pure-imports@v1');
	});

	test('no finding for source package that does not match target', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/cli', 'uuid')]));
		expect(findings).toHaveLength(0);
	});

	test('finding message includes "Pure layer"', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', 'uuid')]));
		expect(findings[0]?.message).toContain('Pure');
	});
});

// ─── LayerRule.describeArtifact() ─────────────────────────────────────────────

describe('LayerRule.describeArtifact()', () => {
	const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();

	test('dependsOn artifact → returns file and dependency', () => {
		const dep = makeDep('@maat-tools/kernel', 'uuid');
		const described = rule.describeArtifact({ kind: 'dependsOn', data: dep });
		expect(described.file).toBe(dep.from.path);
		expect(described.dependency).toBe('uuid');
	});

	test('unknown kind → returns stringified value', () => {
		const described = rule.describeArtifact({ kind: 'other', data: 'raw' });
		expect(described).toEqual({ value: 'raw' });
	});
});

// ─── roles ───────────────────────────────────────────────────────────────────

describe('roles', () => {
	test('Pure has name Pure', () => {
		expect(Pure.name).toBe('Pure');
	});
});
