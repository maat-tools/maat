import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { type Collector, defineCollector } from '@maat-tools/contracts';
import {
	ALGORITHMIC_BINDINGS_CAPABILITY,
	CALL_GRAPH_CAPABILITY,
	CONSTANTS_CAPABILITY,
	DEPENDS_ON_CAPABILITY,
	FUNCTION_SIGNATURES_CAPABILITY,
	POSITIONAL_ACCESSES_CAPABILITY,
	POSITIONAL_SOURCES_CAPABILITY,
} from '@maat-tools/vocabulary';
import type { TSCollectedFacts, TSInput } from './collect';
import type { WorkerResult } from './collect-worker';

export type { TSCollectedFacts, TSInput } from './collect';

export class TSCollector
	implements
		Collector<
			| 'dependsOn'
			| 'constants'
			| 'functionSignatures'
			| 'positionalSources'
			| 'positionalAccesses'
			| 'algorithmicBindings'
			| 'callGraph'
		>
{
	public readonly id = 'maat-tools/collector-ts' as const;
	public readonly provideFacts = [
		CONSTANTS_CAPABILITY,
		DEPENDS_ON_CAPABILITY,
		FUNCTION_SIGNATURES_CAPABILITY,
		POSITIONAL_SOURCES_CAPABILITY,
		POSITIONAL_ACCESSES_CAPABILITY,
		ALGORITHMIC_BINDINGS_CAPABILITY,
		CALL_GRAPH_CAPABILITY,
	] as const;

	public constructor(private readonly config: TSInput) {}

	public collect({
		requiredFactKeys,
	}: {
		requiredFactKeys?: Set<keyof TSCollectedFacts>;
	} = {}): Promise<TSCollectedFacts> {
		const workerEntry = fileURLToPath(import.meta.resolve('@maat-tools/collector-ts/worker'));

		return new Promise((resolve, reject) => {
			const worker = new Worker(workerEntry, { workerData: { config: this.config, requiredFactKeys } });

			worker.once('message', (result: WorkerResult) => {
				void worker.terminate();
				if (result.ok) {
					resolve(result.facts);
				} else {
					const error = new Error(result.error.message);
					error.stack = result.error.stack ?? error.stack;
					reject(error);
				}
			});
			worker.once('error', (error) => {
				void worker.terminate();
				reject(error);
			});
			worker.once('exit', (code) => {
				if (code !== 0) {
					reject(new Error(`TS collector worker exited with code ${code}`));
				}
			});
		});
	}
}

declare module '@maat-tools/contracts' {
	interface CollectorRegistry {
		'@maat-tools/collector-ts': TSInput;
	}
}

export default defineCollector((config: TSInput) => new TSCollector(config));
