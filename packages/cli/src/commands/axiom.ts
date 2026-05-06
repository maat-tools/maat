import { FindingStatus } from '@maat/contracts';
import type { MaatCommand } from '.';
import { MaatCommandBase } from './base';

type AxiomOptions = {
    id: string;
    scope: string;
    claim: string;
    note?: string;
    force?: boolean;
};

export class Axiom extends MaatCommandBase implements MaatCommand {

    public async action(options: AxiomOptions) {
        if (!this.isLedgerProvided()) {
            console.error('No ledger configured. An axiom cannot be recorded without a ledger.');
            process.exit(1);
        }

        if (!options.force) {
            const snapshot = await this.ledger.getState();
            if (snapshot.axioms[options.id] !== undefined) {
                console.error(`Axiom "${options.id}" already exists in the ledger. Use --force to re-declare.`);
                process.exit(1);
            }
        }

        await this.ledger.append({
            type: FindingStatus.AXIOM_DECLARED,
            timestamp: new Date().toISOString(),
            axiom_id: options.id,
            scope: options.scope,
            claim: options.claim,
            ...(options.note !== undefined && { note: options.note }),
        });

        console.log(`Axiom "${options.id}" declared.`);
    }

    public register(): void {
        this.cli
            .command('axiom')
            .description('Declare a human-authored architectural claim and record it in the ledger')
            .requiredOption('--id <id>', 'Stable slug identifying this axiom (used as fold key)')
            .requiredOption('--scope <scope>', 'Architectural scope this axiom applies to')
            .requiredOption('--claim <claim>', 'The invariant being asserted')
            .option('--note <note>', 'Optional rationale or references')
            .option('--force', 'Re-declare even if the axiom id already exists in the ledger')
            .action((options: AxiomOptions) => this.action(options));
    }
}