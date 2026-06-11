import type { Artifact } from './types';

export const LEDGER_BACKEND_FACTORY_BRAND = Symbol.for('maat.LedgerBackendFactory');

export const FindingStatus = {
	OBSERVED: 'finding.observed',
	BASELINED: 'finding.baselined',
	RESOLVED: 'finding.resolved',
	UNVERIFIED: 'finding.unverified',
	REVOKED: 'finding.revoked',
	AXIOM_DECLARED: 'axiom.declared',
	AXIOM_SUPERSEDED: 'axiom.superseded',
	AXIOM_REVOKED: 'axiom.revoked',
} as const;

export type FindingStatus = (typeof FindingStatus)[keyof typeof FindingStatus];

type LedgerEntryBase = {
	readonly entryId: string;
	readonly runId: string;
	readonly timestamp: string;
};

type WithoutEntryId<T> = T extends unknown ? Omit<T, 'entryId' | 'runId'> : never;

type FindingEventBase = LedgerEntryBase & {
	readonly fingerprint: string;
	readonly ruleId: string;
	readonly instanceId: string;
	readonly message: string;
	readonly artifacts: readonly Artifact[];
};

export type FindingObservedEvent = FindingEventBase & {
	readonly type: typeof FindingStatus.OBSERVED;
	readonly reason?: string;
};

export type FindingBaselinedEvent = FindingEventBase & {
	readonly type: typeof FindingStatus.BASELINED;
	readonly expiresAt: string;
};

export type FindingResolvedEvent = FindingEventBase & {
	readonly type: typeof FindingStatus.RESOLVED;
	readonly reason?: string;
};

export type FindingUnverifiedEvent = FindingEventBase & {
	readonly type: typeof FindingStatus.UNVERIFIED;
	readonly requiresVerification: true;
	readonly reason?: string;
};

export type FindingRevokedEvent = FindingEventBase & {
	readonly type: typeof FindingStatus.REVOKED;
	readonly reason?: string;
};

type AxiomEventBase = LedgerEntryBase & {
	readonly axiomId: string;
	readonly scope: string;
	readonly claim: string;
	readonly note?: string;
	readonly fingerprints?: readonly string[];
};

export type AxiomDeclaredEvent = AxiomEventBase & {
	readonly type: typeof FindingStatus.AXIOM_DECLARED;
};

export type AxiomSupersededEvent = AxiomEventBase & {
	readonly type: typeof FindingStatus.AXIOM_SUPERSEDED;
	readonly reason?: string;
};

export type AxiomRevokedEvent = AxiomEventBase & {
	readonly type: typeof FindingStatus.AXIOM_REVOKED;
	readonly reason?: string;
};

export type AxiomEvent = AxiomDeclaredEvent | AxiomSupersededEvent | AxiomRevokedEvent;

export type FindingEvent =
	| FindingObservedEvent
	| FindingBaselinedEvent
	| FindingResolvedEvent
	| FindingUnverifiedEvent
	| FindingRevokedEvent;

export type LedgerEvent = FindingEvent | AxiomEvent;

export type LedgerEventInput = WithoutEntryId<LedgerEvent>;

export interface LedgerBackend {
	initialize(): Promise<void>;
	append(event: LedgerEventInput): Promise<void>;
	getAxiomByFingerprint(fingerprint: string): Promise<AxiomEvent | null>;
	getFindingByFingerprint(fingerprint: string): Promise<FindingEvent | null>;
	getNotBaselinedFindingsState(): Promise<FindingEvent[]>;
	getAllAxiomsState(): Promise<AxiomEvent[]>;
	getAllFindingsState(): Promise<FindingEvent[]>;
}

export type LedgerBackendFactory<TConfig = Record<string, never>> = (config: TConfig) => LedgerBackend;

export type BrandedLedgerBackendFactory<TConfig = Record<string, never>> = LedgerBackendFactory<TConfig> & {
	readonly [LEDGER_BACKEND_FACTORY_BRAND]: true;
};

export function defineLedgerBackend<TConfig>(
	factory: LedgerBackendFactory<TConfig>,
): BrandedLedgerBackendFactory<TConfig> {
	return Object.assign(factory, {
		[LEDGER_BACKEND_FACTORY_BRAND]: true as const,
	});
}

export function isLedgerBackendFactory(fn: unknown): fn is BrandedLedgerBackendFactory<unknown> {
	return typeof fn === 'function' && (fn as unknown as Record<symbol, unknown>)[LEDGER_BACKEND_FACTORY_BRAND] === true;
}
