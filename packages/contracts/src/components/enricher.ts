import type { FactRegistry } from '../registry';

export const ENRICHER_FACTORY_BRAND = Symbol.for('maat.EnricherFactory');

export type EnricherFactory<
	TConfig,
	TNeeds extends keyof FactRegistry = keyof FactRegistry,
	TProduces extends keyof FactRegistry = keyof FactRegistry,
> = (config: TConfig) => Enricher<TNeeds, TProduces>;

export interface Enricher<
    TNeeds extends keyof FactRegistry = keyof FactRegistry,
    TProduces extends keyof FactRegistry = keyof FactRegistry,
> {
    readonly id: string;
    readonly needFacts: readonly TNeeds[];
    readonly provideFacts: readonly TProduces[];
    enrich(
        facts?: { [K in TNeeds]: FactRegistry[K] },
    ): Promise<{ facts: { [K in TProduces]: FactRegistry[K] }; usedTokens?: number; cost?: number }>;
}

export type BrandedEnricherFactory<
    TConfig,
    TNeeds extends keyof FactRegistry = keyof FactRegistry,
    TProduces extends keyof FactRegistry = keyof FactRegistry,
> = EnricherFactory<TConfig, TNeeds, TProduces> & {
    readonly [ENRICHER_FACTORY_BRAND]: true;
};

export function defineEnricher<
	TConfig,
	TNeeds extends keyof FactRegistry = keyof FactRegistry,
	TProduces extends keyof FactRegistry = keyof FactRegistry,
>(factory: EnricherFactory<TConfig, TNeeds, TProduces>): BrandedEnricherFactory<TConfig, TNeeds, TProduces> {
	return Object.assign(factory, { [ENRICHER_FACTORY_BRAND]: true as const });
}

export function isEnricherFactory(
	fn: unknown,
): fn is BrandedEnricherFactory<unknown, keyof FactRegistry, keyof FactRegistry> {
	return typeof fn === 'function' && (fn as unknown as Record<symbol, unknown>)[ENRICHER_FACTORY_BRAND] === true;
}

export function isEnricher(obj: unknown): obj is Enricher<keyof FactRegistry, keyof FactRegistry> {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		typeof (obj as Enricher<keyof FactRegistry, keyof FactRegistry>).id === 'string' &&
		Array.isArray((obj as Enricher<keyof FactRegistry, keyof FactRegistry>).needFacts) &&
		Array.isArray((obj as Enricher<keyof FactRegistry, keyof FactRegistry>).provideFacts) &&
		typeof (obj as Enricher<keyof FactRegistry, keyof FactRegistry>).enrich === 'function'
	);
}