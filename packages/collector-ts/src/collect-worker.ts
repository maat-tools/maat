import { parentPort, workerData } from 'node:worker_threads';
import { runCollect, type TSCollectedFacts, type TSInput } from './collect';

export type WorkerResult =
	| { ok: true; facts: Awaited<ReturnType<typeof runCollect>> }
	| { ok: false; error: { message: string; stack?: string } };

type WorkerData = {
	config: TSInput;
	requiredFactKeys?: Set<keyof TSCollectedFacts>;
};

runCollect(workerData as WorkerData).then(
	(facts) => parentPort?.postMessage({ ok: true, facts } satisfies WorkerResult),
	(error: unknown) =>
		parentPort?.postMessage({
			ok: false,
			error: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
		} satisfies WorkerResult),
);
