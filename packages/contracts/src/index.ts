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

export interface Collector<
	TKeys extends keyof FactRegistry = keyof FactRegistry,
> {
	readonly id: string;
	readonly provideFacts: readonly TKeys[];
	collect(): Promise<Pick<FactRegistry, TKeys>>;
}

export interface Rule<TNeeds extends keyof FactRegistry = keyof FactRegistry> {
	readonly id: string;
	readonly needFacts: readonly TNeeds[];
	evaluate(facts: { [K in TNeeds]: FactRegistry[K] }): FindingRuleOutput[];
}

export interface RuleBuilder {
	build(): Rule;
}

export interface Insight {
	readonly id: string;
	readonly needRules: readonly string[];
	analyze(findings: Finding[]): InsightResult[];
}

type WithoutEntryId<T> = T extends unknown ? Omit<T, 'entry_id'> : never;

export type InsightResult = {
	insightId: string;
	message: string;
	data: unknown;
};

export type FindingEvent =
	| FindingObservedEvent
	| FindingBaselinedEvent
	| FindingPromotedEvent
	| FindingEnforcedEvent
	| FindingResolvedEvent;

export type FindingEventInput = WithoutEntryId<FindingEvent>;

export interface LedgerBackend {
	append(event: LedgerEventInput): Promise<void>;
	getState(): Promise<LedgerSnapshot>;
	buildEntry(finding: Finding, type: FindingStatus): FindingEventInput;
}

export type Artifact = {
	kind: string;
	data: unknown;
};

export type FindingRuleOutput = {
	ruleId: string;
	ruleIdentifier: Record<string, unknown>;
	message: string;
	artifacts: Artifact[];
};

export type Finding = {
	ruleId: string;
	fingerprint: string;
	message: string;
	artifacts: Artifact[];
};

type LedgerEntryBase = {
	readonly entry_id: string;
	readonly timestamp: string;
};

export const FindingStatus = {
	OBSERVED: 'finding.observed',
	BASELINED: 'finding.baselined',
	PROMOTED: 'finding.promoted',
	ENFORCED: 'finding.enforced',
	RESOLVED: 'finding.resolved',
	AXIOM_DECLARED: 'axiom.declared',
	AXIOM_SUPERSEDED: 'axiom.superseded',
	AXIOM_REVOKED: 'axiom.revoked',
} as const;

export type FindingStatus = (typeof FindingStatus)[keyof typeof FindingStatus];

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
};

export type FindingPromotedEvent = LedgerEntryBase & {
	readonly type: typeof FindingStatus.PROMOTED;
	readonly fingerprint: string;
	readonly note?: string;
};

export type FindingEnforcedEvent = LedgerEntryBase & {
	readonly type: typeof FindingStatus.ENFORCED;
	readonly fingerprint: string;
	readonly note?: string;
};

export type FindingResolvedEvent = LedgerEntryBase & {
	readonly type: typeof FindingStatus.RESOLVED;
	readonly fingerprint: string;
};

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

export type AxiomRecord = {
	readonly axiom_id: string;
	readonly scope: string;
	readonly claim: string;
	readonly note?: string;
	readonly fingerprints?: readonly string[];
	readonly active: boolean;
};

export type LedgerEvent =
	| FindingObservedEvent
	| FindingBaselinedEvent
	| FindingPromotedEvent
	| FindingEnforcedEvent
	| FindingResolvedEvent
	| AxiomDeclaredEvent
	| AxiomSupersededEvent
	| AxiomRevokedEvent;

export type LedgerEventInput = WithoutEntryId<LedgerEvent>;

export type FindingRecord = {
	readonly fingerprint: string;
	state: FindingStatus;
	baselined: boolean;
	readonly rule_id: string;
	readonly message: string;
	readonly artifacts: readonly Artifact[];
};

export type LedgerSnapshot = {
	readonly last_entry_id: string | null;
	readonly findings: Record<string, FindingRecord>;
	readonly axioms: Record<string, AxiomRecord>;
};

export type CollectorFactory<
	TConfig,
	TKeys extends keyof FactRegistry = keyof FactRegistry,
> = (config: TConfig) => Collector<TKeys>;

export type RuleFactory<TOptions = Record<string, never>> = (
	options?: TOptions,
) => Rule;

export type InsightFactory<TOptions = Record<string, never>> = (
	options?: TOptions,
) => Insight;

export type RuleSet = {
	readonly factories: readonly BrandedRuleFactory<unknown>[];
};

export type InsightSet = {
	readonly factories: readonly BrandedInsightFactory<unknown>[];
};

export const COLLECTOR_FACTORY_BRAND = Symbol('maat.CollectorFactory');
export const RULE_FACTORY_BRAND = Symbol('maat.RuleFactory');
export const RULE_SET_BRAND = Symbol('maat.RuleSet');
export const RULE_BUILDER_BRAND = Symbol('maat.RuleBuilder');
export const LEDGER_BACKEND_FACTORY_BRAND = Symbol('maat.LedgerBackendFactory');
export const INSIGHT_FACTORY_BRAND = Symbol('maat.InsightFactory');
export const INSIGHT_SET_BRAND = Symbol('maat.InsightSet');

export type BrandedCollectorFactory<
	TConfig,
	TKeys extends keyof FactRegistry = keyof FactRegistry,
> = CollectorFactory<TConfig, TKeys> & {
	readonly [COLLECTOR_FACTORY_BRAND]: true;
};

export type BrandedRuleFactory<TOptions = Record<string, never>> =
	RuleFactory<TOptions> & {
		readonly [RULE_FACTORY_BRAND]: true;
	};

export type BrandedRuleSet = RuleSet & {
	readonly [RULE_SET_BRAND]: true;
};

export type BrandedRuleBuilder = RuleBuilder & {
	readonly [RULE_BUILDER_BRAND]: true;
};

export type LedgerBackendFactory<TConfig = Record<string, never>> = (
	config: TConfig,
) => LedgerBackend;

export type BrandedLedgerBackendFactory<TConfig = Record<string, never>> =
	LedgerBackendFactory<TConfig> & {
		readonly [LEDGER_BACKEND_FACTORY_BRAND]: true;
	};

export type BrandedInsightFactory<TOptions = Record<string, never>> =
	InsightFactory<TOptions> & {
		readonly [INSIGHT_FACTORY_BRAND]: true;
	};

export type BrandedInsightSet = InsightSet & {
	readonly [INSIGHT_SET_BRAND]: true;
};

export function defineCollector<
	TConfig,
	TKeys extends keyof FactRegistry = keyof FactRegistry,
>(
	factory: CollectorFactory<TConfig, TKeys>,
): BrandedCollectorFactory<TConfig, TKeys> {
	return Object.assign(factory, { [COLLECTOR_FACTORY_BRAND]: true as const });
}

export function defineRule<TOptions = Record<string, never>>(
	factory: RuleFactory<TOptions>,
): BrandedRuleFactory<TOptions> {
	return Object.assign(factory, { [RULE_FACTORY_BRAND]: true as const });
}

export function defineRuleSet<T>(
	factories: BrandedRuleFactory<T>[],
): BrandedRuleSet {
	return { factories: factories as unknown as BrandedRuleFactory<unknown>[], [RULE_SET_BRAND]: true as const };
}

export function defineRuleBuilder<T extends RuleBuilder>(builder: T): T & { readonly [RULE_BUILDER_BRAND]: true } {
	return Object.assign(builder, { [RULE_BUILDER_BRAND]: true as const });
}

export function defineInsight<TOptions = Record<string, never>>(
	factory: InsightFactory<TOptions>,
): BrandedInsightFactory<TOptions> {
	return Object.assign(factory, { [INSIGHT_FACTORY_BRAND]: true as const });
}

export function defineInsightSet<T>(
	factories: BrandedInsightFactory<T>[],
): BrandedInsightSet {
	return { factories: factories as unknown as BrandedInsightFactory<unknown>[], [INSIGHT_SET_BRAND]: true as const };
}

export function defineLedgerBackend<TConfig>(
	factory: LedgerBackendFactory<TConfig>,
): BrandedLedgerBackendFactory<TConfig> {
	return Object.assign(factory, {
		[LEDGER_BACKEND_FACTORY_BRAND]: true as const,
	});
}

export function isCollectorFactory(
	fn: unknown,
): fn is BrandedCollectorFactory<unknown, keyof FactRegistry> {
	return (
		typeof fn === 'function' &&
		(fn as unknown as Record<symbol, unknown>)[COLLECTOR_FACTORY_BRAND] === true
	);
}

export function isRuleFactory(
	fn: unknown,
): fn is BrandedRuleFactory<Record<string, unknown>> {
	return (
		typeof fn === 'function' &&
		(fn as unknown as Record<symbol, unknown>)[RULE_FACTORY_BRAND] === true
	);
}

export function isRuleSet(obj: unknown): obj is BrandedRuleSet {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		(obj as Record<symbol, unknown>)[RULE_SET_BRAND] === true
	);
}

export function isCollector(
	obj: unknown,
): obj is Collector<keyof FactRegistry> {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		typeof (obj as Collector<keyof FactRegistry>).id === 'string' &&
		Array.isArray((obj as Collector<keyof FactRegistry>).provideFacts) &&
		typeof (obj as Collector<keyof FactRegistry>).collect === 'function'
	);
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

export function isRuleBuilder(obj: unknown): obj is BrandedRuleBuilder {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		(obj as Record<symbol, unknown>)[RULE_BUILDER_BRAND] === true &&
		typeof (obj as RuleBuilder).build === 'function'
	);
}

export function isLedgerBackendFactory(
	fn: unknown,
): fn is BrandedLedgerBackendFactory<unknown> {
	return (
		typeof fn === 'function' &&
		(fn as unknown as Record<symbol, unknown>)[LEDGER_BACKEND_FACTORY_BRAND] ===
			true
	);
}

export function isInsightFactory(
	fn: unknown,
): fn is BrandedInsightFactory<Record<string, never>> {
	return (
		typeof fn === 'function' &&
		(fn as unknown as Record<symbol, unknown>)[INSIGHT_FACTORY_BRAND] === true
	);
}

export function isInsightSet(obj: unknown): obj is BrandedInsightSet {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		(obj as Record<symbol, unknown>)[INSIGHT_SET_BRAND] === true
	);
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
