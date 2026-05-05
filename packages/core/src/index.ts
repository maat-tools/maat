import { ulid } from 'ulid';
import { createHash } from 'node:crypto';
import {
	FindingStatus,
	type CollectorRegistry,
	type Finding,
	type LedgerBackend,
	type LedgerBackendRegistry,
	type LedgerEvent,
	type LedgerEventInput,
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
	| [string & {}, Record<string, unknown>];

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

type JsonObject = object & {
	toJSON?: (key: string) => unknown;
};

function serializeStableValue(
	value: unknown,
	seen: WeakSet<object>,
): string | undefined {
	if (value === null) return 'null';

	switch (typeof value) {
		case 'boolean':
		case 'number':
		case 'string':
			return JSON.stringify(value);
		case 'bigint':
			throw new TypeError(
				'Cannot generate a stable fingerprint for BigInt values',
			);
		case 'function':
		case 'symbol':
		case 'undefined':
			return undefined;
	}

	const objectValue = value as JsonObject;
	const toJSON = objectValue.toJSON;
	if (typeof toJSON === 'function') {
		return serializeStableValue(toJSON.call(objectValue, ''), seen);
	}

	if (seen.has(objectValue)) {
		throw new TypeError(
			'Cannot generate a stable fingerprint for circular structures',
		);
	}

	seen.add(objectValue);

	if (Array.isArray(objectValue)) {
		const items = objectValue.map(
			(item) => serializeStableValue(item, seen) ?? 'null',
		);
		seen.delete(objectValue);
		return `[${items.join(',')}]`;
	}

	const record = objectValue as Record<string, unknown>;
	const properties = Object.keys(record)
		.sort()
		.flatMap((key) => {
			const serialized = serializeStableValue(record[key], seen);
			return serialized === undefined
				? []
				: [`${JSON.stringify(key)}:${serialized}`];
		});

	seen.delete(objectValue);
	return `{${properties.join(',')}}`;
}

function stableStringify(data: unknown): string {
	const serialized = serializeStableValue(data, new WeakSet());
	if (serialized === undefined) {
		throw new TypeError(
			'Cannot generate a stable fingerprint for unsupported root values',
		);
	}

	return serialized;
}

type FindingEventStatus = Exclude<FindingStatus, typeof FindingStatus.AXIOM_DECLARED>;

export abstract class LedgerBackendBase implements LedgerBackend {
	abstract append(event: LedgerEventInput): Promise<void>;

	public buildEntry(finding: Finding, type: FindingEventStatus): LedgerEvent {
		const base = {
			entry_id: ulid(),
			timestamp: new Date().toISOString(),
		};

		switch (type) {
			case FindingStatus.OBSERVED:
				return { ...base, type, fingerprint: finding.fingerprint, rule_id: finding.ruleId, message: finding.message, artifacts: finding.artifacts };
			case FindingStatus.BASELINED:
				return { ...base, type, fingerprint: finding.fingerprint };
			case FindingStatus.PROMOTED:
				return { ...base, type, fingerprint: finding.fingerprint };
			case FindingStatus.ENFORCED:
				return { ...base, type, fingerprint: finding.fingerprint };
		}
	}
}

export abstract class RuleBase {
	public generateFingerprint(data: unknown): string {
		return createHash('sha256').update(stableStringify(data)).digest('hex');
	}
}

export {
	type Collector,
	defineCollector,
	defineInsight,
	defineInsightSet,
	defineLedgerBackend,
	defineRule,
	defineRuleSet,
	type Insight,
	type InsightResult,
	type InsightSet,
	isInsightFactory,
	isInsightSet,
	isLedgerBackendFactory,
	type LedgerBackend,
	type Rule,
} from '@maat/contracts';
