export type { CoMRuleOptions } from './com';
export { ConnascenceOfMeaningRule, default as com } from './com';
export type { CoPRuleOptions } from './cop';
export { ConnascenceOfPositionRule, default as cop } from './cop';

import { defineRuleSet } from '@maat-tools/contracts';
import type { CoMRuleOptions } from './com';
import com from './com';
import type { CoPRuleOptions } from './cop';
import cop from './cop';

declare module '@maat-tools/contracts' {
	interface RuleRegistry {
		'@maat-tools/connascence-rules': { com: CoMRuleOptions; cop: CoPRuleOptions };
		'@maat-tools/connascence-rules/com': CoMRuleOptions;
		'@maat-tools/connascence-rules/cop': CoPRuleOptions;
	}
}

export default defineRuleSet([com, cop]);
