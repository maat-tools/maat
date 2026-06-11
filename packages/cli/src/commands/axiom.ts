import { FindingStatus } from '@maat-tools/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type DeclareOptions = {
	id: string;
	scope: string;
	claim: string;
	note?: string;
	fingerprints?: string;
	force?: boolean;
};

type LifecycleOptions = {
	id: string;
	reason?: string;
};

type AxiomLifecycleStatus = typeof FindingStatus.AXIOM_SUPERSEDED | typeof FindingStatus.AXIOM_REVOKED;

const LIFECYCLE_VERBS: Record<AxiomLifecycleStatus, string> = {
	[FindingStatus.AXIOM_REVOKED]: 'revoked',
	[FindingStatus.AXIOM_SUPERSEDED]: 'superseded',
};

function parseFingerprints(value: string | undefined): string[] {
	if (!value) {
		return [];
	}

	return value
		.split(',')
		.map((fingerprint) => fingerprint.trim())
		.filter(Boolean);
}

export class Axiom extends MaatCommandBase implements MaatCommand {
	public async action(...args: unknown[]): Promise<void> {
		await this.declare(args[0] as DeclareOptions);
	}

	public register(): void {
		const cmd = this.cli.command('axiom').description('Manage architectural axioms in the ledger');

		cmd
			.command('declare')
			.description('Declare a human-authored architectural claim and record it in the ledger')
			.requiredOption('--id <id>', 'Stable slug identifying this axiom (used as fold key)')
			.requiredOption('--scope <scope>', 'Architectural scope this axiom applies to')
			.requiredOption('--claim <claim>', 'The invariant being asserted')
			.option('--note <note>', 'Optional rationale or references')
			.option('--fingerprints <fingerprints>', 'Comma-separated finding fingerprints this axiom covers')
			.action((options: DeclareOptions) => this.declare(options));

		cmd
			.command('supersede')
			.description('Mark an axiom as superseded by a newer declaration')
			.requiredOption('--id <id>', 'The axiom id to supersede')
			.option('--reason <reason>', 'Optional explanation for supersession')
			.action((options: LifecycleOptions) => this.lifecycle(FindingStatus.AXIOM_SUPERSEDED, options));

		cmd
			.command('revoke')
			.description('Revoke an axiom that no longer applies')
			.requiredOption('--id <id>', 'The axiom id to revoke')
			.option('--reason <reason>', 'Optional explanation for revocation')
			.action((options: LifecycleOptions) => this.lifecycle(FindingStatus.AXIOM_REVOKED, options));
	}

	private async declare(options: DeclareOptions): Promise<void> {
		if (!this.isLedgerProvided()) {
			this.presenter.error('No ledger configured. An axiom cannot be recorded without a ledger.\n');
			process.exit(1);
		}

		const fingerprints = parseFingerprints(options.fingerprints);
		if (fingerprints.length > 0) {
			const existingFindings = await Promise.all(fingerprints.map((fingerprint) => this.ledger.getFindingByFingerprint(fingerprint)));
			const invalidFingerprints = fingerprints.filter((_, index) => !existingFindings[index]);

			if (invalidFingerprints.length > 0) {
				this.presenter.error(
					`The following fingerprints do not correspond to any known findings in the ledger: ${invalidFingerprints.join(', ')}. ` +
						`Please verify the fingerprints or omit them if you want to declare the axiom without linking it to specific findings.\n`,
				);
				process.exit(1);
			}
		}

		await this.ledger.append({
			type: FindingStatus.AXIOM_DECLARED,
			timestamp: new Date().toISOString(),
			axiomId: options.id,
			scope: options.scope,
			claim: options.claim,
			...(options.note === undefined ? {} : { note: options.note }),
			...(fingerprints.length === 0 ? {} : { fingerprints }),
		});

		this.presenter.success(`Axiom "${options.id}" declared.\n`);
		this.presenter.detail('scope:', options.scope);
		this.presenter.detail('\nclaim:', options.claim);
		if (options.note) {
			this.presenter.detail('note:', options.note);
		}
		if (fingerprints.length > 0) {
			this.presenter.detail('fingerprints:', fingerprints.join(', '));
		}
	}

	private async lifecycle(type: AxiomLifecycleStatus, options: LifecycleOptions): Promise<void> {
		if (!this.isLedgerProvided()) {
			this.presenter.error('No ledger configured. Axiom lifecycle commands require a ledger.\n');
			process.exit(1);
		}

		const axiom = await this.ledger.getAxiomByFingerprint(options.id);
		if (!axiom) {
			this.presenter.error(`Axiom "${options.id}" not found in the ledger.\n`);
			process.exit(1);
		}

		if (axiom.type !== FindingStatus.AXIOM_DECLARED) {
			this.presenter.error(`Axiom "${options.id}" is already inactive(revoked or superseded).\n`);
			process.exit(1);
		}

		await this.ledger.append({
			type,
			timestamp: new Date().toISOString(),
			axiomId: options.id,
			scope: axiom.scope,
			claim: axiom.claim,
			...(axiom.note === undefined ? {} : { note: axiom.note }),
			...(axiom.fingerprints === undefined ? {} : { fingerprints: axiom.fingerprints }),
			...(options.reason === undefined ? {} : { reason: options.reason }),
		});

		this.presenter.warn(`Axiom "${options.id}" ${LIFECYCLE_VERBS[type]}.\n`);
		if (options.reason) {
			this.presenter.detail('reason:', options.reason);
		}
	}
}
