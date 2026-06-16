import { defineRule } from '@maat-tools/contracts';

const ledgerPath = process.env['MAAT_TEST_LEDGER'];

const collector = {
	id: 'static-collector',
	provideFacts: ['staticFiles'],
	async collect() {
		return { staticFiles: [{ path: 'src/index.ts' }] } as any;
	},
};

const enricher = {
	id: 'verify-enricher',
	needFacts: [],
	provideFacts: ['verifiedFact'],
	async enrich() {
		return { facts: { verifiedFact: true } as any };
	},
};

const rule = defineRule(() => ({
	instanceId: 'verify-rule',
	id: 'verify-rule',
	needFacts: ['verifiedFact'],
	evaluate() {
		return [
			{
				ruleId: 'verify-rule',
				ruleIdentifier: { id: 'verify-finding' },
				message: 'finding that needs verification',
				artifacts: [],
			},
		];
	},
	describeArtifact() {
		return {};
	},
}));

export default {
	check: { strict: false },
	collectors: [collector],
	enrichers: [enricher],
	rules: [rule()],
	...(ledgerPath ? { ledger: ['@maat-tools/file-ledger', { path: ledgerPath }] } : {}),
};
