import { describe, expect, test } from 'bun:test';
import { RULE_BUILDER_BRAND, isRule, isRuleBuilder } from '@maat/contracts';
import type { Import } from '@maat/vocabulary';
import { layer } from './layer';
import { Pure } from './roles';

function makeImport(overrides: Partial<Import> = {}): Import {
	return {
		file: '/repo/packages/kernel/src/index.ts',
		packageName: '@maat/kernel',
		specifier: '@maat/contracts',
		location: { file: '/repo/packages/kernel/src/index.ts', line: 1 },
		...overrides,
	};
}

describe('layer()', () => {
	test('returns a branded RuleBuilder', () => {
		const builder = layer('@maat/kernel');
		expect(isRuleBuilder(builder)).toBe(true);
		expect(builder[RULE_BUILDER_BRAND]).toBe(true);
	});

	test('.is() returns the same builder instance', () => {
		const builder = layer('@maat/kernel');
		expect(builder.is(Pure)).toBe(builder);
	});

	test('.allows() returns the same builder instance', () => {
		const builder = layer('@maat/kernel');
		expect(builder.allows('@maat/contracts')).toBe(builder);
	});

	test('.build() returns a valid Rule', () => {
		const rule = layer('@maat/kernel').is(Pure).allows('@maat/contracts').build();
		expect(isRule(rule)).toBe(true);
		expect(rule.id).toBe('layer:@maat/kernel@v1');
		expect(rule.needFacts).toContain('imports');
	});
});

describe('LayerRule.evaluate() — allowlist', () => {
	test('no finding when specifier is in allows list', () => {
		const rule = layer('@maat/kernel').is(Pure).allows('@maat/contracts').build();
		const findings = rule.evaluate({ imports: [makeImport({ specifier: '@maat/contracts' })] });
		expect(findings).toHaveLength(0);
	});

	test('finding when specifier is NOT in allows list', () => {
		const rule = layer('@maat/kernel').is(Pure).allows('@maat/contracts').build();
		const findings = rule.evaluate({ imports: [makeImport({ specifier: 'uuid' })] });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('layer:@maat/kernel@v1');
	});

	test('no finding for relative imports regardless of allows list', () => {
		const rule = layer('@maat/kernel').is(Pure).allows('@maat/contracts').build();
		const findings = rule.evaluate({
			imports: [
				makeImport({ specifier: './utils' }),
				makeImport({ specifier: '../types' }),
			],
		});
		expect(findings).toHaveLength(0);
	});

	test('no finding when packageName does not match target', () => {
		const rule = layer('@maat/kernel').is(Pure).allows('@maat/contracts').build();
		const findings = rule.evaluate({
			imports: [makeImport({ packageName: '@maat/cli', specifier: 'uuid' })],
		});
		expect(findings).toHaveLength(0);
	});

	test('allows() with empty list — any non-relative import is a finding', () => {
		const rule = layer('@maat/contracts').is(Pure).allows().build();
		const findings = rule.evaluate({ imports: [makeImport({ packageName: '@maat/contracts', specifier: 'node:crypto' })] });
		expect(findings).toHaveLength(1);
	});

	test('string pattern matches sub-path', () => {
		const rule = layer('@maat/kernel').is(Pure).allows('@maat/contracts').build();
		const findings = rule.evaluate({ imports: [makeImport({ specifier: '@maat/contracts/types' })] });
		expect(findings).toHaveLength(0);
	});

	test('string pattern does not match partial package name', () => {
		const rule = layer('@maat/kernel').is(Pure).allows('@maat/contracts').build();
		const findings = rule.evaluate({ imports: [makeImport({ specifier: '@maat/contracts-extra' })] });
		expect(findings).toHaveLength(1);
	});

	test('regexp pattern in allows list', () => {
		const rule = layer('@maat/kernel').is(Pure).allows(/^@maat\//).build();
		const findings = rule.evaluate({ imports: [makeImport({ specifier: '@maat/contracts' })] });
		expect(findings).toHaveLength(0);
	});

	test('regexp pattern — non-matching specifier is a finding', () => {
		const rule = layer('@maat/kernel').is(Pure).allows(/^@maat\//).build();
		const findings = rule.evaluate({ imports: [makeImport({ specifier: 'uuid' })] });
		expect(findings).toHaveLength(1);
	});

	test('includes role name in message', () => {
		const rule = layer('@maat/kernel').is(Pure).allows('@maat/contracts').build();
		const findings = rule.evaluate({ imports: [makeImport({ specifier: 'uuid' })] });
		expect(findings[0]?.message).toContain('Pure');
	});

	test('multiple imports — only disallowed ones produce findings', () => {
		const rule = layer('@maat/kernel').is(Pure).allows('@maat/contracts', '@maat/core').build();
		const findings = rule.evaluate({
			imports: [
				makeImport({ specifier: '@maat/contracts' }),
				makeImport({ specifier: '@maat/core' }),
				makeImport({ specifier: 'uuid' }),
				makeImport({ specifier: './utils' }),
			],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ specifier: 'uuid' });
	});
});

describe('roles', () => {
	test('Pure has name Pure', () => {
		expect(Pure.name).toBe('Pure');
	});
});
