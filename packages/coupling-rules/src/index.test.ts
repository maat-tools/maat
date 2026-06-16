import { describe, expect, test } from 'bun:test';
import { type BrandedRuleBuilder, isRule, isRuleBuilder, RULE_BUILDER_BRAND } from '@maat-tools/contracts';
import { layer, Pure } from './index';

describe('coupling-rules exports', () => {
	test('layer() factory returns a builder', () => {
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

	test('Pure role has correct name', () => {
		expect(Pure.name).toBe('Pure');
	});
});
