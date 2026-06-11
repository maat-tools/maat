import { parentPort, workerData } from 'node:worker_threads';
import { runCollect, type TSInput } from './collect';

export type WorkerResult =
	| { ok: true; facts: Awaited<ReturnType<typeof runCollect>> }
	| { ok: false; error: { message: string; stack?: string } };

runCollect(workerData as TSInput).then(
	(facts) => parentPort?.postMessage({ ok: true, facts } satisfies WorkerResult),
	(error: unknown) =>
		parentPort?.postMessage({
			ok: false,
			error: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
		} satisfies WorkerResult),
);
