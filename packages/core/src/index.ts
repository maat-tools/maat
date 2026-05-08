import {
	type AxiomRecord,
	type BrandedRuleBuilder,
	type CollectorRegistry,
	type Finding,
	type FindingEventInput,
	type FindingRecord,
	FindingStatus,
	generateFingerprint,
	type LedgerBackend,
	type LedgerBackendRegistry,
	type LedgerEvent,
	type LedgerEventInput,
	type LedgerSnapshot,
	type Rule,
	type RuleRegistry,
} from '@maat-tools/contracts';
import { ulid } from 'ulid';

type RegistryTuples<R> = { [K in keyof R]: [K, R[K]] }[keyof R];

export type CollectorEntry =
	| keyof CollectorRegistry
	| RegistryTuples<CollectorRegistry>
	| (string & {})
	| [string & {}, Record<string, unknown>];

export type RuleEntry =
	| keyof RuleRegistry
	| RegistryTuples<RuleRegistry>
	| (string & {})
	| [string & {}, Record<string, unknown>]
	| Rule
	| BrandedRuleBuilder;

export type InsightEntry = (string & {}) | [string & {}, Record<string, unknown>];

export type LedgerEntry =
	| keyof LedgerBackendRegistry
	| RegistryTuples<LedgerBackendRegistry>
	| (string & {})
	| [string & {}, Record<string, unknown>];

export type MaatConfig = {
	check?: { strict: boolean };
	collectors: CollectorEntry[];
	rules: RuleEntry[];
} & ({ ledger: LedgerEntry; insights?: InsightEntry[] } | { ledger?: never; insights?: never });

export function defineConfig(config: MaatConfig): MaatConfig {
	return config;
}

export abstract class RuleBase {
	public generateFingerprint(ruleId: string, ruleIdentifier: Record<string, unknown>): string {
		return generateFingerprint(ruleId, ruleIdentifier);
	}
}

type FindingEventStatus = Exclude<
	FindingStatus,
	| typeof FindingStatus.AXIOM_DECLARED
	| typeof FindingStatus.AXIOM_SUPERSEDED
	| typeof FindingStatus.AXIOM_REVOKED
	| typeof FindingStatus.RESOLVED
>;

export abstract class LedgerBackendBase implements LedgerBackend {
	public abstract append(event: LedgerEventInput): Promise<void>;
	public abstract getState(): Promise<LedgerSnapshot>;

	protected stampEvent(input: LedgerEventInput): LedgerEvent {
		return { entry_id: ulid(), ...input } as LedgerEvent;
	}

	public buildEntry(finding: Finding, type: FindingEventStatus): FindingEventInput {
		const base = { timestamp: new Date().toISOString() };

		switch (type) {
			case FindingStatus.OBSERVED:
				return {
					...base,
					type,
					fingerprint: finding.fingerprint,
					rule_id: finding.ruleId,
					message: finding.message,
					artifacts: finding.artifacts,
				};
			case FindingStatus.BASELINED:
				return { ...base, type, fingerprint: finding.fingerprint };
			case FindingStatus.PROMOTED:
				return { ...base, type, fingerprint: finding.fingerprint };
			case FindingStatus.ENFORCED:
				return { ...base, type, fingerprint: finding.fingerprint };
		}
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
				} satisfies FindingRecord;
				break;
			}
			case FindingStatus.BASELINED: {
				const record = findings[event.fingerprint];
				if (record !== undefined) {
					findings[event.fingerprint] = { ...record, baselined: true };
				}
				break;
			}
			case FindingStatus.PROMOTED:
			case FindingStatus.ENFORCED:
			case FindingStatus.RESOLVED: {
				const record = findings[event.fingerprint];
				if (record !== undefined) {
					findings[event.fingerprint] = { ...record, state: event.type };
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
	defineInsight,
	defineInsightSet,
	defineLedgerBackend,
	defineRule,
	defineRuleBuilder,
	defineRuleSet,
	type Insight,
	type InsightResult,
	type InsightSet,
	isInsightFactory,
	isInsightSet,
	isLedgerBackendFactory,
	isRuleBuilder,
	type LedgerBackend,
	type Rule,
	type RuleBuilder,
} from '@maat-tools/contracts';
