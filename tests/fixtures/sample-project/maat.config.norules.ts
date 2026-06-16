import { TSCollector } from '@maat-tools/collector-ts';
import { resolve } from 'node:path';

const ledgerPath = process.env['MAAT_TEST_LEDGER'];

export default {
	collectors: [new TSCollector({ tsConfigFilePath: resolve(import.meta.dir, 'tsconfig.json') })],
	rules: [],
	...(ledgerPath ? { ledger: ['@maat-tools/file-ledger', { path: ledgerPath }] } : {}),
};
