import { describe, expect, test } from 'bun:test';
import { isRule, isRuleSet } from '@maat-tools/contracts';
import defaultRuleSet, {
	ConnascenceOfAlgorithmTechnicalRule,
	ConnascenceOfMeaningRule,
	ConnascenceOfMeaningSemanticRule,
	ConnascenceOfPositionArgsRule,
	ConnascenceOfPositionStructRule,
	coaTechnical,
	com,
	copArgs,
	copStruct,
} from './index';

describe('connascence-rules exports', () => {
	test('default export is a rule set', () => {
		expect(isRuleSet(defaultRuleSet)).toBe(true);
	});

	test('factory functions return rules', () => {
		expect(isRule(com())).toBe(true);
		expect(isRule(copArgs())).toBe(true);
		expect(isRule(copStruct())).toBe(true);
		expect(isRule(coaTechnical())).toBe(true);
	});

	test('rule classes are exported', () => {
		expect(new ConnascenceOfMeaningRule()).toBeInstanceOf(ConnascenceOfMeaningRule);
		expect(new ConnascenceOfPositionArgsRule()).toBeInstanceOf(ConnascenceOfPositionArgsRule);
		expect(new ConnascenceOfPositionStructRule()).toBeInstanceOf(ConnascenceOfPositionStructRule);
		expect(new ConnascenceOfAlgorithmTechnicalRule()).toBeInstanceOf(ConnascenceOfAlgorithmTechnicalRule);
		expect(() => new ConnascenceOfMeaningSemanticRule({ threshold: '0.5' })).not.toThrow();
	});

	test('rule ids match registry names', () => {
		expect(com().id).toBe('maat-tools/connascence-rules/com@v1');
		expect(copArgs().id).toBe('maat-tools/connascence-rules/cop-args@v1');
		expect(copStruct().id).toBe('maat-tools/connascence-rules/cop-struct@v1');
		expect(coaTechnical().id).toBe('maat-tools/coa-technical@v1');
	});
});
