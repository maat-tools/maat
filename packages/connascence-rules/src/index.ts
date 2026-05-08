export type { CoMRuleOptions } from './com';
export { ConnascenceOfMeaningRule, default as com } from './com';

import { defineRuleSet } from '@maat-tools/contracts';
import type { CoMRuleOptions } from './com';
import com from './com';

declare module '@maat-tools/contracts' {
	interface RuleRegistry {
		'@maat-tools/connascence-rules': { com: CoMRuleOptions };
		'@maat-tools/connascence-rules/com': CoMRuleOptions;
	}
}

export default defineRuleSet([com]);
