import { TSCollector } from '@maat-tools/collector-ts';
import { com, copArgs, copStruct } from '@maat-tools/connascence-rules';
import { resolve } from 'node:path';

const ledgerPath = process.env['MAAT_TEST_LEDGER'];

export default {
	collectors: [new TSCollector({ tsConfigFilePath: resolve(import.meta.dir, 'tsconfig.json') })],
	rules: [com({ threshold: 2 }), copArgs({ maxArgumentsAllowed: 3 }), copStruct()],
	...(ledgerPath ? { ledger: ['@maat-tools/file-ledger', { path: ledgerPath }] } : {}),
};
