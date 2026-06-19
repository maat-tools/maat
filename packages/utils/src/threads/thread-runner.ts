import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { parentPort, workerData } from 'node:worker_threads';

export type ThreadResult<TData = unknown> =
    | { ok: true; data: TData }
    | { ok: false; error: { message: string; stack?: string } };

export async function wrapFunctionForThread<TInput, TOutput>(fn: (input: TInput) => Promise<TOutput>): Promise<void> {
    return fn(workerData as TInput).then(
        (data) => parentPort?.postMessage({ ok: true, data } satisfies { ok: true; data: TOutput }),
        (error: unknown) =>
            parentPort?.postMessage({
                ok: false,
                error: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
            } satisfies { ok: false; error: { message: string; stack?: string } }),
    );
}

export class ThreadRunner {
    private workerEntry: string;

    public constructor(filename: string | URL) {
        this.workerEntry = typeof filename === 'string' ? fileURLToPath(import.meta.resolve(filename)) : fileURLToPath(filename);
    }

    public run<TInput, TOutput>(input: TInput): Promise<TOutput> {
        return new Promise((resolve, reject) => {
            const worker = new Worker(this.workerEntry, { workerData: input });

            worker.once('message', (result: ThreadResult<TOutput>) => {
                void worker.terminate();
                if (result.ok) {
                    resolve(result.data);
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
                reject(new Error(`Worker stopped with exit code ${code}`));
            });
        });
    }
}