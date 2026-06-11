import {
	type AnyCollector,
	type AxiomEvent,
	type CollectorRegistry,
	type EnricherRegistry,
	type FindingEvent,
	FindingStatus,
	generateFingerprint,
	type Insight,
	type LedgerBackend,
	type LedgerBackendRegistry,
	type LedgerEvent,
	type LedgerEventInput,
	type Rule,
	type RuleRegistry,
} from '@maat-tools/contracts';
import { ulid } from 'ulid';

type RegistryTuples<R> = { [K in keyof R]: [K, R[K]] }[keyof R];

type OptionalConfigTuple<
	R,
	K extends keyof R,
> = /* biome-ignore lint/complexity/noBannedTypes: empty object check */ {} extends R[K] ? [K] | [K, R[K]] : [K, R[K]];
type RuleConfigTuples<R> = { [K in keyof R]: OptionalConfigTuple<R, K> }[keyof R];

export type CollectorEntry = keyof CollectorRegistry | RegistryTuples<CollectorRegistry> | AnyCollector;

export type RuleEntry = keyof RuleRegistry | RuleConfigTuples<RuleRegistry> | Rule;

export type EnricherEntry = keyof EnricherRegistry | RegistryTuples<EnricherRegistry>;

export type InsightEntry = (string & {}) | [string & {}, Record<string, unknown>] | Insight;

export type LedgerEntry = keyof LedgerBackendRegistry | RegistryTuples<LedgerBackendRegistry> | LedgerBackend;

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

export type LedgerSnapshot = {
	readonly lastEntryId: string | null;
	readonly findings: Record<string, FindingEvent>;
	readonly axioms: Record<string, AxiomEvent>;
};

const AXIOM_EVENT_TYPES: ReadonlySet<FindingStatus> = new Set([
	FindingStatus.AXIOM_DECLARED,
	FindingStatus.AXIOM_SUPERSEDED,
	FindingStatus.AXIOM_REVOKED,
]);

export function isAxiomEvent(event: LedgerEvent): event is AxiomEvent {
	return AXIOM_EVENT_TYPES.has(event.type);
}

export abstract class LedgerBackendBase implements LedgerBackend {
	private readonly runId = ulid();

	public abstract initialize(): Promise<void>;
	public abstract append(event: LedgerEventInput): Promise<void>;
	public abstract getAllAxiomsState(): Promise<AxiomEvent[]>;
	public abstract getAllFindingsState(): Promise<FindingEvent[]>;
	public abstract getAxiomByFingerprint(fingerprint: string): Promise<AxiomEvent | null>;
	public abstract getFindingByFingerprint(fingerprint: string): Promise<FindingEvent | null>;
	public abstract getNotBaselinedFindingsState(): Promise<FindingEvent[]>;

	protected stampEvent(input: LedgerEventInput): LedgerEvent {
		return { entryId: ulid(), runId: this.runId, ...input };
	}

	protected assertValidTransition(current: LedgerEvent | undefined, input: LedgerEventInput): void {
		const doesNotExist = current === undefined;
		if (doesNotExist || isAxiomEvent(current)) {
			return;
		}

		const reObservation = input.type === FindingStatus.OBSERVED || input.type === FindingStatus.UNVERIFIED;

		if (
			reObservation &&
			current.type === FindingStatus.BASELINED &&
			new Date(current.expiresAt).getTime() > Date.now()
		) {
			throw new Error(
				`invalid transition: finding "${current.fingerprint}" is baselined until ${current.expiresAt}; ` +
					`appending "${input.type}" would silently discard the baseline`,
			);
		}
	}

	protected applyEventLastWriteWins(snapshot: LedgerSnapshot, event: LedgerEvent): LedgerSnapshot {
		if (isAxiomEvent(event)) {
			return {
				lastEntryId: event.entryId,
				findings: snapshot.findings,
				axioms: { ...snapshot.axioms, [event.axiomId]: event },
			};
		}

		return {
			lastEntryId: event.entryId,
			findings: { ...snapshot.findings, [event.fingerprint]: event },
			axioms: snapshot.axioms,
		};
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

export type {
	LLMConfig,
	LLMProvider,
} from '@maat-tools/utils';
