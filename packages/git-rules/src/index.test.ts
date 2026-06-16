import { describe, expect, test } from 'bun:test';
import { isRule, isRuleSet } from '@maat-tools/contracts';
import defaultRuleSet, { ChurnRule, churn } from './index';

describe('git-rules exports', () => {
	test('default export is a rule set', () => {
		expect(isRuleSet(defaultRuleSet)).toBe(true);
	});

	test('churn() factory returns a rule', () => {
		const rule = churn();
		expect(isRule(rule)).toBe(true);
		expect(rule.id).toBe('maat-tools/git-rules/churn@v1');
		expect(rule.needFacts).toContain('git_commits');
		expect(rule.needFacts).toContain('git_file_changes');
	});

	test('ChurnRule class is exported', () => {
		expect(new ChurnRule()).toBeInstanceOf(ChurnRule);
	});
});
