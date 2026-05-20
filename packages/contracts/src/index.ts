import { createHash } from 'node:crypto';
// biome-ignore lint/suspicious/noEmptyInterface: intentionally empty for declaration merging
export interface FactRegistry {}

// biome-ignore lint/suspicious/noEmptyInterface: intentionally empty for declaration merging
export interface CollectorRegistry {}

// biome-ignore lint/suspicious/noEmptyInterface: intentionally empty for declaration merging
export interface RuleRegistry {}

// biome-ignore lint/suspicious/noEmptyInterface: intentionally empty for declaration merging
export interface LedgerBackendRegistry {}

// biome-ignore lint/suspicious/noEmptyInterface: intentionally empty for declaration merging
export interface InsightRegistry {}

// biome-ignore lint/suspicious/noEmptyInterface: intentionally empty for declaration merging
export interface EnricherRegistry {}

export type Artifact = {
	kind: string;
	data: unknown;
};

export type Finding = {
	ruleId: string;
	fingerprint: string;
	message: string;
	artifacts: Artifact[];
	requiresVerification?: boolean;
};

export type FindingRuleOutput = {
	ruleId: string;
	ruleIdentifier: Record<string, unknown>;
	message: string;
	artifacts: Artifact[];
};

export type InsightResult = {
	insightId: string;
	message: string;
	data: unknown;
};

export const FindingStatus = {
	OBSERVED: 'finding.observed',
	BASELINED: 'finding.baselined',
	RESOLVED: 'finding.resolved',
	VERIFIED: 'finding.verified',
	REVOKED: 'finding.revoked',
	AXIOM_DECLARED: 'axiom.declared',
	AXIOM_SUPERSEDED: 'axiom.superseded',
	AXIOM_REVOKED: 'axiom.revoked',
} as const;

export type FindingStatus = (typeof FindingStatus)[keyof typeof FindingStatus];

type LedgerEntryBase = {
	readonly entry_id: string;
	readonly run_id: string;
	readonly timestamp: string;
};

type WithoutEntryId<T> = T extends unknown ? Omit<T, 'entry_id' | 'run_id'> : never;

export type FindingObservedEvent = LedgerEntryBase & {
	readonly type: typeof FindingStatus.OBSERVED;
	readonly fingerprint: string;
	readonly rule_id: string;
	readonly message: string;
	readonly artifacts: readonly Artifact[];
};

export type FindingBaselinedEvent = LedgerEntryBase & {
	readonly type: typeof FindingStatus.BASELINED;
	readonly fingerprint: string;
	readonly expires_at: string;
};

export type FindingResolvedEvent = LedgerEntryBase & {
	readonly type: typeof FindingStatus.RESOLVED;
	readonly fingerprint: string;
};

export type FindingVerifiedEvent = LedgerEntryBase & {
	readonly type: typeof FindingStatus.VERIFIED;
	readonly fingerprint: string;
	readonly reason?: string;
};

export type FindingRevokedEvent = LedgerEntryBase & {
	readonly type: typeof FindingStatus.REVOKED;
	readonly fingerprint: string;
	readonly reason?: string;
};

export type FindingEvent =
	| FindingObservedEvent
	| FindingBaselinedEvent
	| FindingResolvedEvent
	| FindingVerifiedEvent
	| FindingRevokedEvent;

export type FindingEventInput = WithoutEntryId<FindingEvent>;

export type AxiomDeclaredEvent = LedgerEntryBase & {
	readonly type: typeof FindingStatus.AXIOM_DECLARED;
	readonly axiom_id: string;
	readonly scope: string;
	readonly claim: string;
	readonly note?: string;
	readonly fingerprints?: readonly string[];
};

export type AxiomSupersededEvent = LedgerEntryBase & {
	readonly type: typeof FindingStatus.AXIOM_SUPERSEDED;
	readonly axiom_id: string;
	readonly reason?: string;
};

export type AxiomRevokedEvent = LedgerEntryBase & {
	readonly type: typeof FindingStatus.AXIOM_REVOKED;
	readonly axiom_id: string;
	readonly reason?: string;
};

export type LedgerEvent =
	| FindingObservedEvent
	| FindingBaselinedEvent
	| FindingResolvedEvent
	| FindingVerifiedEvent
	| FindingRevokedEvent
	| AxiomDeclaredEvent
	| AxiomSupersededEvent
	| AxiomRevokedEvent;

export type LedgerEventInput = WithoutEntryId<LedgerEvent>;

export type FindingRecord = {
	readonly fingerprint: string;
	state: FindingStatus;
	baselined: boolean;
	readonly baseline_expires_at?: string;
	readonly rule_id: string;
	readonly message: string;
	readonly artifacts: readonly Artifact[];
	verified: boolean;
};

export type AxiomRecord = {
	readonly axiom_id: string;
	readonly scope: string;
	readonly claim: string;
	readonly note?: string;
	readonly fingerprints?: readonly string[];
	readonly active: boolean;
};

export type LedgerSnapshot = {
	readonly last_entry_id: string | null;
	readonly findings: Record<string, FindingRecord>;
	readonly axioms: Record<string, AxiomRecord>;
};

export interface Collector<TKeys extends keyof FactRegistry = keyof FactRegistry> {
	readonly id: string;
	readonly provideFacts: readonly TKeys[];
	collect(): Promise<Pick<FactRegistry, TKeys>>;
}

export interface Rule<TNeeds extends keyof FactRegistry = keyof FactRegistry> {
	readonly id: string;
	readonly needFacts: readonly TNeeds[];
	evaluate(facts: { [K in TNeeds]: FactRegistry[K] }): FindingRuleOutput[];
	describeArtifact(artifact: Artifact): Record<string, string>;
}

export interface RuleBuilder {
	build(): Rule;
}

export interface Enricher<
	TNeeds extends keyof FactRegistry = keyof FactRegistry,
	TProduces extends keyof FactRegistry = keyof FactRegistry,
> {
	readonly id: string;
	readonly needFacts: readonly TNeeds[];
	readonly provideFacts: readonly TProduces[];
	enrich(facts: { [K in TNeeds]: FactRegistry[K] }): Promise<{ [K in TProduces]: FactRegistry[K] }>;
}

export interface Insight {
	readonly id: string;
	readonly needRules: readonly string[];
	analyze(findings: Finding[]): InsightResult[];
}

export interface LedgerBackend {
	append(event: LedgerEventInput): Promise<void>;
	getState(): Promise<LedgerSnapshot>;
}

export type CollectorFactory<TConfig, TKeys extends keyof FactRegistry = keyof FactRegistry> = (
	config: TConfig,
) => Collector<TKeys>;

export type RuleFactory<TOptions = Record<string, never>> = (options?: TOptions) => Rule;

export type InsightFactory<TOptions = Record<string, never>> = (options?: TOptions) => Insight;

export type EnricherFactory<
	TConfig,
	TNeeds extends keyof FactRegistry = keyof FactRegistry,
	TProduces extends keyof FactRegistry = keyof FactRegistry,
> = (config: TConfig) => Enricher<TNeeds, TProduces>;

export type LedgerBackendFactory<TConfig = Record<string, never>> = (config: TConfig) => LedgerBackend;

export const COLLECTOR_FACTORY_BRAND = Symbol.for('maat.CollectorFactory');
export const ENRICHER_FACTORY_BRAND = Symbol.for('maat.EnricherFactory');
export const RULE_FACTORY_BRAND = Symbol.for('maat.RuleFactory');
export const RULE_SET_BRAND = Symbol.for('maat.RuleSet');
export const RULE_BUILDER_BRAND = Symbol.for('maat.RuleBuilder');
export const LEDGER_BACKEND_FACTORY_BRAND = Symbol.for('maat.LedgerBackendFactory');
export const INSIGHT_FACTORY_BRAND = Symbol.for('maat.InsightFactory');
export const INSIGHT_SET_BRAND = Symbol.for('maat.InsightSet');

export type BrandedCollectorFactory<TConfig, TKeys extends keyof FactRegistry = keyof FactRegistry> = CollectorFactory<
	TConfig,
	TKeys
> & {
	readonly [COLLECTOR_FACTORY_BRAND]: true;
};

export type BrandedEnricherFactory<
	TConfig,
	TNeeds extends keyof FactRegistry = keyof FactRegistry,
	TProduces extends keyof FactRegistry = keyof FactRegistry,
> = EnricherFactory<TConfig, TNeeds, TProduces> & {
	readonly [ENRICHER_FACTORY_BRAND]: true;
};

export type BrandedRuleFactory<TOptions = Record<string, never>> = RuleFactory<TOptions> & {
	readonly [RULE_FACTORY_BRAND]: true;
};

export type BrandedInsightFactory<TOptions = Record<string, never>> = InsightFactory<TOptions> & {
	readonly [INSIGHT_FACTORY_BRAND]: true;
};

export type BrandedLedgerBackendFactory<TConfig = Record<string, never>> = LedgerBackendFactory<TConfig> & {
	readonly [LEDGER_BACKEND_FACTORY_BRAND]: true;
};

export type RuleSet = {
	// biome-ignore lint/suspicious/noExplicitAny: factories have heterogeneous option types
	readonly factories: readonly BrandedRuleFactory<any>[];
};

export type InsightSet = {
	readonly factories: readonly BrandedInsightFactory<unknown>[];
};

export type BrandedRuleSet = RuleSet & {
	readonly [RULE_SET_BRAND]: true;
};

export type BrandedRuleBuilder = RuleBuilder & {
	readonly [RULE_BUILDER_BRAND]: true;
};

export type BrandedInsightSet = InsightSet & {
	readonly [INSIGHT_SET_BRAND]: true;
};

export function defineCollector<TConfig, TKeys extends keyof FactRegistry = keyof FactRegistry>(
	factory: CollectorFactory<TConfig, TKeys>,
): BrandedCollectorFactory<TConfig, TKeys> {
	return Object.assign(factory, { [COLLECTOR_FACTORY_BRAND]: true as const });
}

export function defineEnricher<
	TConfig,
	TNeeds extends keyof FactRegistry = keyof FactRegistry,
	TProduces extends keyof FactRegistry = keyof FactRegistry,
>(factory: EnricherFactory<TConfig, TNeeds, TProduces>): BrandedEnricherFactory<TConfig, TNeeds, TProduces> {
	return Object.assign(factory, { [ENRICHER_FACTORY_BRAND]: true as const });
}

export function defineRule<TOptions = Record<string, never>>(
	factory: RuleFactory<TOptions>,
): BrandedRuleFactory<TOptions> {
	return Object.assign(factory, { [RULE_FACTORY_BRAND]: true as const });
}

// biome-ignore lint/suspicious/noExplicitAny: rule factories have heterogeneous option types
export function defineRuleSet(factories: BrandedRuleFactory<any>[]): BrandedRuleSet {
	return {
		factories,
		[RULE_SET_BRAND]: true as const,
	};
}

export function defineRuleBuilder<T extends RuleBuilder>(builder: T): T {
	return Object.assign(builder, { [RULE_BUILDER_BRAND]: true as const });
}

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

export function defineLedgerBackend<TConfig>(
	factory: LedgerBackendFactory<TConfig>,
): BrandedLedgerBackendFactory<TConfig> {
	return Object.assign(factory, {
		[LEDGER_BACKEND_FACTORY_BRAND]: true as const,
	});
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

export function isRuleFactory(fn: unknown): fn is BrandedRuleFactory<Record<string, unknown>> {
	return typeof fn === 'function' && (fn as unknown as Record<symbol, unknown>)[RULE_FACTORY_BRAND] === true;
}

export function isRuleSet(obj: unknown): obj is BrandedRuleSet {
	return typeof obj === 'object' && obj !== null && (obj as Record<symbol, unknown>)[RULE_SET_BRAND] === true;
}

export function isRule(obj: unknown): obj is Rule {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		typeof (obj as Rule).id === 'string' &&
		Array.isArray((obj as Rule).needFacts) &&
		typeof (obj as Rule).evaluate === 'function'
	);
}

export function isRuleBuilder(obj: unknown): obj is RuleBuilder {
	return typeof obj === 'object' && obj !== null && typeof (obj as RuleBuilder).build === 'function';
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

export function isLedgerBackendFactory(fn: unknown): fn is BrandedLedgerBackendFactory<unknown> {
	return typeof fn === 'function' && (fn as unknown as Record<symbol, unknown>)[LEDGER_BACKEND_FACTORY_BRAND] === true;
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') {
		return JSON.stringify(value) ?? 'null';
	}
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(',')}]`;
	}
	const obj = value as Record<string, unknown>;
	const pairs = Object.keys(obj)
		.sort()
		.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);

	return `{${pairs.join(',')}}`;
}

export function generateFingerprint(ruleId: string, ruleIdentifier: Record<string, unknown>): string {
	return createHash('sha256')
		.update(stableStringify({ ruleId, data: ruleIdentifier }))
		.digest('hex');
}
