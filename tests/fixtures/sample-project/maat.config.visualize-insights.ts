import { TSCollector } from '@maat-tools/collector-ts';
import { com, copArgs, copStruct } from '@maat-tools/connascence-rules';
import { resolve } from 'node:path';

const ledgerPath = process.env['MAAT_TEST_LEDGER'];

const echoInsight = {
	id: 'test/echo@v1',
	needRules: ['test@v1'],
	analyze(findings: Array<{ fingerprint: string }>) {
		if (findings.length === 0) {
			return [];
		}

		return [
			{
				insightId: 'test/echo@v1',
				message: `${findings.length} finding(s) observed`,
				data: findings.map((f) => f.fingerprint),
			},
		];
	},
};

export default {
	collectors: [new TSCollector({ tsConfigFilePath: resolve(import.meta.dir, 'tsconfig.json') })],
	rules: [com({ threshold: 2 }), copArgs({ maxArgumentsAllowed: 3 }), copStruct()],
	insights: [echoInsight],
	...(ledgerPath ? { ledger: ['@maat-tools/file-ledger', { path: ledgerPath }] } : {}),
};
