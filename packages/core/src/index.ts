import { createHash } from 'node:crypto';
import {
	type AxiomRecord,
	type BrandedRuleBuilder,
	type CollectorRegistry,
	type Finding,
	type FindingEventInput,
	type FindingRecord,
	FindingStatus,
	type LedgerBackend,
	type LedgerBackendRegistry,
	type LedgerEvent,
	type LedgerEventInput,
	type LedgerSnapshot,
	type Rule,
	type RuleRegistry,
} from '@maat/contracts';

type CollectorRegistryTuples = {
	[K in keyof CollectorRegistry]: [K, CollectorRegistry[K]];
}[keyof CollectorRegistry];

type RuleRegistryTuples = {
	[K in keyof RuleRegistry]: [K, RuleRegistry[K]];
}[keyof RuleRegistry];

type LedgerBackendRegistryTuples = {
	[K in keyof LedgerBackendRegistry]: [K, LedgerBackendRegistry[K]];
}[keyof LedgerBackendRegistry];

export type CollectorEntry =
	| keyof CollectorRegistry
	| CollectorRegistryTuples
	| (string & {})
	| [string & {}, Record<string, unknown>];

export type RuleEntry =
	| keyof RuleRegistry
	| RuleRegistryTuples
	| (string & {})
	| [string & {}, Record<string, unknown>]
	| Rule
	| BrandedRuleBuilder;

export type InsightEntry =
	| (string & {})
	| [string & {}, Record<string, unknown>];

export type LedgerEntry =
	| keyof LedgerBackendRegistry
	| LedgerBackendRegistryTuples
	| (string & {})
	| [string & {}, Record<string, unknown>];

export type MaatConfig = {
	check?: { strict: boolean };
	collectors: CollectorEntry[];
	rules: RuleEntry[];
} & (
	| { ledger: LedgerEntry; insights?: InsightEntry[] }
	| { ledger?: never; insights?: never }
);

export function defineConfig(config: MaatConfig): MaatConfig {
	return config;
}

export function stableStringify(value: unknown): string {
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

export function stableHash(value: unknown): string {
	return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function fingerprintFinding(finding: {
	ruleId: string;
	message: string;
	artifacts: unknown[];
}): string {
	return stableHash({
		ruleId: finding.ruleId,
		message: finding.message,
		artifacts: finding.artifacts,
	});
}

export abstract class RuleBase {
	generateFingerprint(data: Record<string, unknown>): string {
		return stableHash(data);
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
	abstract append(event: LedgerEventInput): Promise<void>;
	abstract getState(): Promise<LedgerSnapshot>;

	public buildEntry(
		finding: Finding,
		type: FindingEventStatus,
	): FindingEventInput {
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

	protected applyEvent(
		snapshot: LedgerSnapshot,
		event: LedgerEvent,
	): LedgerSnapshot {
		const findings = { ...snapshot.findings };
		const axioms = { ...snapshot.axioms };

		if (event.type === FindingStatus.OBSERVED) {
			const existing = findings[event.fingerprint];
			const newState = this.getNewState(existing?.state);
			findings[event.fingerprint] = {
				fingerprint: event.fingerprint,
				state: newState,
				baselined: existing?.baselined ?? false,
				rule_id: event.rule_id,
				message: event.message,
				artifacts: event.artifacts,
			} satisfies FindingRecord;
		} else if (event.type === FindingStatus.BASELINED) {
			const record = findings[event.fingerprint];
			if (record !== undefined) {
				findings[event.fingerprint] = { ...record, baselined: true };
			}
		} else if (event.type === FindingStatus.PROMOTED) {
			const record = findings[event.fingerprint];
			if (record !== undefined) {
				findings[event.fingerprint] = {
					...record,
					state: FindingStatus.PROMOTED,
				};
			}
		} else if (event.type === FindingStatus.ENFORCED) {
			const record = findings[event.fingerprint];
			if (record !== undefined) {
				findings[event.fingerprint] = {
					...record,
					state: FindingStatus.ENFORCED,
				};
			}
		} else if (event.type === FindingStatus.RESOLVED) {
			const record = findings[event.fingerprint];
			if (record !== undefined) {
				findings[event.fingerprint] = {
					...record,
					state: FindingStatus.RESOLVED,
				};
			}
		} else if (event.type === FindingStatus.AXIOM_DECLARED) {
			axioms[event.axiom_id] = {
				axiom_id: event.axiom_id,
				scope: event.scope,
				claim: event.claim,
				note: event.note,
				fingerprints: event.fingerprints,
				active: true,
			} satisfies AxiomRecord;
		} else if (event.type === FindingStatus.AXIOM_SUPERSEDED) {
			const record = axioms[event.axiom_id];
			if (record !== undefined) {
				axioms[event.axiom_id] = { ...record, active: false };
			}
		} else if (event.type === FindingStatus.AXIOM_REVOKED) {
			const record = axioms[event.axiom_id];
			if (record !== undefined) {
				axioms[event.axiom_id] = { ...record, active: false };
			}
		}

		return { last_entry_id: event.entry_id, findings, axioms };
	}

	private getNewState(existingState?: FindingStatus): FindingStatus {
		if (!existingState) {
			return FindingStatus.OBSERVED;
		}
		if (existingState === FindingStatus.RESOLVED) {
			return FindingStatus.OBSERVED;
		}
		return existingState ?? FindingStatus.OBSERVED;
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
} from '@maat/contracts';
