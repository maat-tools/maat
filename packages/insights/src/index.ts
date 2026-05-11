export type { ErosionOptions } from './erosion';
export { ErosionInsight, default as erosion } from './erosion';

import { defineInsightSet } from '@maat-tools/contracts';
import erosion from './erosion';

declare module '@maat-tools/contracts' {
	interface InsightRegistry {
		'@maat-tools/insights': Record<string, never>;
	}
}

export default defineInsightSet([erosion]);
