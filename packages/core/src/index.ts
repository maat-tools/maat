import {
	type AxiomRecord,
	type CollectorRegistry,
	type EnricherRegistry,
	type FindingRecord,
	FindingStatus,
	generateFingerprint,
	type Insight,
	type LedgerBackend,
	type LedgerBackendRegistry,
	type LedgerEvent,
	type LedgerEventInput,
	type LedgerSnapshot,
	type Rule,
	type RuleBuilder,
	type RuleRegistry,
} from '@maat-tools/contracts';
import { ulid } from 'ulid';

type RegistryTuples<R> = { [K in keyof R]: [K, R[K]] }[keyof R];

type OptionalConfigTuple<
	R,
	K extends keyof R,
> = /* biome-ignore lint/complexity/noBannedTypes: empty object check */ {} extends R[K] ? [K] | [K, R[K]] : [K, R[K]];
type RuleConfigTuples<R> = { [K in keyof R]: OptionalConfigTuple<R, K> }[keyof R];

export type CollectorEntry =
	| keyof CollectorRegistry
	| RegistryTuples<CollectorRegistry>
	| (string & {})
	| [string & {}, Record<string, unknown>];

export type RuleEntry =
	| keyof RuleRegistry
	| RuleConfigTuples<RuleRegistry>
	| (string & {})
	| [string & {}, Record<string, unknown>]
	| Rule
	| RuleBuilder;

export type EnricherEntry =
	| keyof EnricherRegistry
	| RegistryTuples<EnricherRegistry>;

export type InsightEntry = (string & {}) | [string & {}, Record<string, unknown>] | Insight;

export type LedgerEntry =
	| keyof LedgerBackendRegistry
	| RegistryTuples<LedgerBackendRegistry>
	| (string & {})
	| [string & {}, Record<string, unknown>];

export type MaatConfig = {
	check?: { strict: boolean };
	collectors: CollectorEntry[];
	enrichers?: EnricherEntry[];
	rules: RuleEntry[];
	insights?: InsightEntry[];
} & ({ ledger: LedgerEntry } | { ledger?: never });

export function defineConfig<const T extends MaatConfig>(config: T): T {
	return config;
}

export function rule<K extends keyof RuleRegistry>(
	id: K,
	...options: /* biome-ignore lint/complexity/noBannedTypes: empty object check */ {} extends RuleRegistry[K]
		? [options?: RuleRegistry[K]]
		: [options: RuleRegistry[K]]
): RuleEntry {
	return (options.length > 0 ? [id, options[0]] : id) as unknown as RuleEntry;
}

export abstract class RuleBase {
	public generateFingerprint(ruleId: string, ruleIdentifier: Record<string, unknown>): string {
		return generateFingerprint(ruleId, ruleIdentifier);
	}
}

export abstract class LedgerBackendBase implements LedgerBackend {
	private readonly runId = ulid();

	public abstract append(event: LedgerEventInput): Promise<void>;
	public abstract getState(): Promise<LedgerSnapshot>;

	protected stampEvent(input: LedgerEventInput): LedgerEvent {
		return { entry_id: ulid(), run_id: this.runId, ...input } as LedgerEvent;
	}

	protected applyEvent(snapshot: LedgerSnapshot, event: LedgerEvent): LedgerSnapshot {
		const findings = { ...snapshot.findings };
		const axioms = { ...snapshot.axioms };

		switch (event.type) {
			case FindingStatus.OBSERVED: {
				const existing = findings[event.fingerprint];
				findings[event.fingerprint] = {
					fingerprint: event.fingerprint,
					state: this.nextState(existing?.state),
					baselined: existing?.baselined ?? false,
					rule_id: event.rule_id,
					message: event.message,
					artifacts: event.artifacts,
					verified: existing?.verified ?? false,
				} satisfies FindingRecord;
				break;
			}
			case FindingStatus.BASELINED: {
				const record = findings[event.fingerprint];
				if (record !== undefined) {
					findings[event.fingerprint] = { ...record, baselined: true, baseline_expires_at: event.expires_at };
				}
				break;
			}
			case FindingStatus.RESOLVED: {
				const record = findings[event.fingerprint];
				if (record !== undefined) {
					findings[event.fingerprint] = { ...record, state: event.type };
				}
				break;
			}
			case FindingStatus.VERIFIED: {
				const record = findings[event.fingerprint];
				if (record !== undefined) {
					findings[event.fingerprint] = { ...record, verified: true };
				}
				break;
			}
			case FindingStatus.REVOKED: {
				const record = findings[event.fingerprint];
				if (record !== undefined) {
					findings[event.fingerprint] = { ...record, verified: false };
				}
				break;
			}
			case FindingStatus.AXIOM_DECLARED: {
				axioms[event.axiom_id] = {
					axiom_id: event.axiom_id,
					scope: event.scope,
					claim: event.claim,
					note: event.note,
					fingerprints: event.fingerprints,
					active: true,
				} satisfies AxiomRecord;
				break;
			}
			case FindingStatus.AXIOM_SUPERSEDED:
			case FindingStatus.AXIOM_REVOKED: {
				const record = axioms[event.axiom_id];
				if (record !== undefined) {
					axioms[event.axiom_id] = { ...record, active: false };
				}
				break;
			}
		}

		return { last_entry_id: event.entry_id, findings, axioms };
	}

	private nextState(existingState?: FindingStatus): FindingStatus {
		if (!existingState || existingState === FindingStatus.RESOLVED) {
			return FindingStatus.OBSERVED;
		}

		return existingState;
	}
}

export {
	type BrandedRuleBuilder,
	type Collector,
	defineCollector,
	defineEnricher,
	defineInsight,
	defineInsightSet,
	defineLedgerBackend,
	defineRule,
	defineRuleBuilder,
	defineRuleSet,
	type Enricher,
	type Insight,
	type InsightResult,
	type InsightSet,
	isEnricherFactory,
	isInsightFactory,
	isInsightSet,
	isLedgerBackendFactory,
	isRuleBuilder,
	type LedgerBackend,
	type Rule,
	type RuleBuilder,
} from '@maat-tools/contracts';

export {
	type LLMProvider,
	type OpenAIModel,
	type LLMConfig,
} from '@maat-tools/utils';
