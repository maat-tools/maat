import type { FactRegistry } from '../registry';

export const COLLECTOR_FACTORY_BRAND = Symbol.for('maat.CollectorFactory');

export interface Collector<TKeys extends keyof FactRegistry = keyof FactRegistry> {
    readonly id: string;
    readonly provideFacts: readonly TKeys[];
    collect(): Promise<Pick<FactRegistry, TKeys>>;
}

export type AnyCollector = Omit<Collector<never>, 'provideFacts' | 'collect'> & {
    readonly provideFacts: readonly string[];
    collect(): Promise<unknown>;
};

export type CollectorFactory<TConfig, TKeys extends keyof FactRegistry = keyof FactRegistry> = (
    config: TConfig,
) => Collector<TKeys>;


export type BrandedCollectorFactory<TConfig, TKeys extends keyof FactRegistry = keyof FactRegistry> = CollectorFactory<
    TConfig,
    TKeys
> & {
    readonly [COLLECTOR_FACTORY_BRAND]: true;
};

export function defineCollector<TConfig, TKeys extends keyof FactRegistry = keyof FactRegistry>(
	factory: CollectorFactory<TConfig, TKeys>,
): BrandedCollectorFactory<TConfig, TKeys> {
	return Object.assign(factory, { [COLLECTOR_FACTORY_BRAND]: true as const });
}

export function isCollectorFactory(fn: unknown): fn is BrandedCollectorFactory<unknown, keyof FactRegistry> {
	return typeof fn === 'function' && (fn as unknown as Record<symbol, unknown>)[COLLECTOR_FACTORY_BRAND] === true;
}

export function isCollector(obj: unknown): obj is Collector<keyof FactRegistry> {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		typeof (obj as Collector<keyof FactRegistry>).id === 'string' &&
		Array.isArray((obj as Collector<keyof FactRegistry>).provideFacts) &&
		typeof (obj as Collector<keyof FactRegistry>).collect === 'function'
	);
}