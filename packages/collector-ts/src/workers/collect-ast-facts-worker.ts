import { wrapFunctionForThread } from '@maat-tools/utils';
import type { TSCollectedFacts, TSInput } from '..';
import { collectASTFacts } from '../collect';

type WorkerData = {
	tsConfigPath: string,
	config: TSInput,
	projectRoot: string,
	requiredFactKeys?: Set<keyof TSCollectedFacts>,
};


wrapFunctionForThread<WorkerData, ReturnType<typeof collectASTFacts>>(async (workerData: WorkerData) => collectASTFacts(workerData));
