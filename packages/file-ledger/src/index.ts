import { appendFile } from 'node:fs/promises';
import { ulid } from 'ulid';
import {
	defineLedgerBackend,
	type FindingRecord,
	type LedgerBackend,
	type LedgerEvent,
	type LedgerEventInput,
} from '@maat/contracts';
import { LedgerBackendBase } from '../../core/src';

export type {
	AxiomDeclaredEvent,
	FindingBaselinedEvent,
	FindingEnforcedEvent,
	FindingObservedEvent,
	FindingPromotedEvent,
	FindingRecord,
	FindingState,
	LedgerBackend,
	LedgerEvent,
} from '@maat/contracts';

export { defineLedgerBackend } from '@maat/contracts';

type FilePathLedgerInput = {
	path: string;
};

export class FilePathLedgerBackend extends LedgerBackendBase implements LedgerBackend {
	constructor(private readonly options: FilePathLedgerInput) {
		super();
	}

	public async append(event: LedgerEventInput): Promise<void> {
		const entry = { ...event, entry_id: ulid() } as LedgerEvent;

		await appendFile(this.options.path, `${JSON.stringify(entry)}\n`, 'utf-8');
	}

	private async readAll(): Promise<LedgerEvent[]> {
		const file = Bun.file(this.options.path);
		if (!(await file.exists())) {
			return [];
		}

		const text = await file.text();
		return text
			.split('\n')
			.filter((line) => line.trim().length > 0)
			.map((line) => JSON.parse(line) as LedgerEvent);
	}

	private async fold(
		events: LedgerEvent[],
	): Promise<Map<string, FindingRecord>> {
		const records = new Map<string, FindingRecord>();

		for (const event of events) {
			if (event.type === 'finding.observed') {
				records.set(event.fingerprint, {
					fingerprint: event.fingerprint,
					state: 'observed',
					baselined: false,
					rule_id: event.rule_id,
					message: event.message,
					artifacts: event.artifacts,
				});
			} else if (event.type === 'finding.baselined') {
				const record = records.get(event.fingerprint);
				if (record !== undefined) record.baselined = true;
			} else if (event.type === 'finding.promoted') {
				const record = records.get(event.fingerprint);
				if (record !== undefined) record.state = 'promoted';
			} else if (event.type === 'finding.enforced') {
				const record = records.get(event.fingerprint);
				if (record !== undefined) record.state = 'enforced';
			}
			// axiom.declared events are not folded into FindingRecord — axioms are separate
		}

		return records;
	}
}

declare module '@maat/contracts' {
	interface LedgerBackendRegistry {
		'@maat/ledger': FilePathLedgerInput;
	}
}

export default defineLedgerBackend(
	(config: FilePathLedgerInput) => new FilePathLedgerBackend(config),
);
