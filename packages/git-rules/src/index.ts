export type { ChurnOptions } from './churn';
export { ChurnRule, default as churn } from './churn';

import { defineRuleSet } from '@maat-tools/contracts';
import type { ChurnOptions } from './churn';
import churn from './churn';

declare module '@maat-tools/contracts' {
	interface RuleRegistry {
		'@maat-tools/git-rules': { churn: ChurnOptions };
	}
}

export default defineRuleSet([churn]);
