import type { Finding } from './types';

export const INSIGHT_FACTORY_BRAND = Symbol.for('maat.InsightFactory');
export const INSIGHT_SET_BRAND = Symbol.for('maat.InsightSet');

export type BrandedInsightFactory<TOptions = Record<string, never>> = InsightFactory<TOptions> & {
    readonly [INSIGHT_FACTORY_BRAND]: true;
};

export type InsightSet = {
    readonly factories: readonly BrandedInsightFactory<unknown>[];
};

export type BrandedInsightSet = InsightSet & {
    readonly [INSIGHT_SET_BRAND]: true;
};

export type InsightResult = {
    insightId: string;
    message: string;
    data: unknown;
};

export interface Insight {
    readonly id: string;
    readonly needRules: readonly string[];
    analyze(findings: Finding[]): InsightResult[];
}

export type InsightFactory<TOptions = Record<string, never>> = (options?: TOptions) => Insight;

export function defineInsight<TOptions = Record<string, never>>(
	factory: InsightFactory<TOptions>,
): BrandedInsightFactory<TOptions> {
	return Object.assign(factory, { [INSIGHT_FACTORY_BRAND]: true as const });
}

export function defineInsightSet<T>(factories: BrandedInsightFactory<T>[]): BrandedInsightSet {
	return {
		factories: factories as unknown as BrandedInsightFactory<unknown>[],
		[INSIGHT_SET_BRAND]: true as const,
	};
}

export function isInsightFactory(fn: unknown): fn is BrandedInsightFactory<Record<string, never>> {
	return typeof fn === 'function' && (fn as unknown as Record<symbol, unknown>)[INSIGHT_FACTORY_BRAND] === true;
}

export function isInsightSet(obj: unknown): obj is BrandedInsightSet {
	return typeof obj === 'object' && obj !== null && (obj as Record<symbol, unknown>)[INSIGHT_SET_BRAND] === true;
}

export function isInsight(obj: unknown): obj is Insight {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		typeof (obj as Insight).id === 'string' &&
		Array.isArray((obj as Insight).needRules) &&
		typeof (obj as Insight).analyze === 'function'
	);
}