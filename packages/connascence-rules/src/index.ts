export type { CoATechnicalOptions } from './coa/technical';
export { ConnascenceOfAlgorithmTechnicalRule, default as coaTechnical } from './coa/technical';
export type { CoMRuleOptions } from './com';
export { ConnascenceOfMeaningRule, default as com } from './com';
export type { CoPArgsRuleOptions, CoPStructRuleOptions } from './cop';
export {
	ConnascenceOfPositionArgsRule,
	ConnascenceOfPositionStructRule,
	copArgs,
	copStruct,
} from './cop';

import { defineRuleSet } from '@maat-tools/contracts';
import type { CoATechnicalOptions } from './coa/technical';
import coaTechnical from './coa/technical';
import type { CoMRuleOptions } from './com';
import com from './com';
import type { CoPArgsRuleOptions, CoPStructRuleOptions } from './cop';
import copArgs from './cop/args';
import copStruct from './cop/struct';

declare module '@maat-tools/contracts' {
	interface RuleRegistry {
		'@maat-tools/connascence-rules': {
			com: CoMRuleOptions;
			copArgs: CoPArgsRuleOptions;
			copStruct: CoPStructRuleOptions;
			coaTechnical: CoATechnicalOptions;
		};
		'@maat-tools/connascence-rules/com': CoMRuleOptions;
		'@maat-tools/connascence-rules/cop-args': CoPArgsRuleOptions;
		'@maat-tools/connascence-rules/cop-struct': CoPStructRuleOptions;
		'@maat-tools/connascence-rules/coa-technical': CoATechnicalOptions;
	}
}

export default defineRuleSet([com, copArgs, copStruct, coaTechnical]);
