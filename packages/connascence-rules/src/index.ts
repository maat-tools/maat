export type { CoMRuleOptions } from './com';
export { ConnascenceOfMeaningRule, default as com } from './com';

import { defineRuleSet } from '@maat/contracts';
import com from './com';

import type { CoMRuleOptions } from './com';

declare module '@maat/contracts' {
	interface RuleRegistry {
		'@maat/connascence-rules': { com: CoMRuleOptions };
		'@maat/connascence-rules/com': CoMRuleOptions;
	}
}

export default defineRuleSet([com]);