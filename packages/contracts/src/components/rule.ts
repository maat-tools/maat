import type { FactRegistry } from '../registry';
import type { Artifact } from './types';

export const RULE_FACTORY_BRAND = Symbol.for('maat.RuleFactory');
export const RULE_SET_BRAND = Symbol.for('maat.RuleSet');
export const RULE_BUILDER_BRAND = Symbol.for('maat.RuleBuilder');

export type RuleOutput = {
	ruleId: string;
	ruleIdentifier: Record<string, unknown>;
	message: string;
	artifacts: Artifact[];
};

export interface Rule<TNeeds extends keyof FactRegistry = keyof FactRegistry> {
	readonly instanceId: string;
	readonly id: string;
	readonly needFacts: readonly TNeeds[];
	evaluate(facts: { [K in TNeeds]: FactRegistry[K] }): RuleOutput[];
	describeArtifact(artifact: Artifact): Record<string, string>;
}

export interface RuleBuilder {
	build(): Rule;
}

export type BrandedRuleFactory<TOptions = Record<string, never>> = RuleFactory<TOptions> & {
	readonly [RULE_FACTORY_BRAND]: true;
};

export type RuleFactory<TOptions = Record<string, never>> = (options?: TOptions) => Rule;

export type RuleSet = {
	// biome-ignore lint/suspicious/noExplicitAny: factories have heterogeneous option types
	readonly factories: readonly BrandedRuleFactory<any>[];
};

export type BrandedRuleSet = RuleSet & {
	readonly [RULE_SET_BRAND]: true;
};

export type BrandedRuleBuilder = RuleBuilder & {
	readonly [RULE_BUILDER_BRAND]: true;
};

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
