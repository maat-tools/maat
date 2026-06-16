import { com } from '@maat-tools/connascence-rules';

const ledgerPath = process.env['MAAT_TEST_LEDGER'];

export default {
	collectors: [],
	rules: [com({ threshold: 2 })],
	...(ledgerPath ? { ledger: ['@maat-tools/file-ledger', { path: ledgerPath }] } : {}),
};
