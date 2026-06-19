import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { Collector, Rule } from '@maat-tools/contracts';
import { TSCollector } from '@maat-tools/collector-ts';

const logPath = process.env['MAAT_SMART_COLLECTION_LOG'];

const observingCollector: Collector<'constants'> = {
	id: 'observing-constants-collector',
	provideFacts: ['constants'] as const,
	collect: async ({ requiredFactKeys }: { requiredFactKeys?: Set<keyof FactRegistry> } = {}) => {
		if (logPath) {
			await writeFile(logPath, JSON.stringify([...(requiredFactKeys ?? [])]), 'utf-8');
		}

		const tsCollector = new TSCollector({ tsConfigFilePath: resolve(import.meta.dir, 'tsconfig.json') });
		const { constants } = await tsCollector.collect({ requiredFactKeys });
		return { constants };
	},
};

const constantsRule: Rule<'constants'> = {
	instanceId: 'constants-only@v1',
	id: 'constants-only@v1',
	needFacts: ['constants'] as const,
	evaluate: ({ constants }) => ({
		findings: constants
			.filter((c) => c.value === 'hello-smart-collection')
			.map((c) => ({
				ruleId: 'constants-only@v1',
				ruleIdentifier: { value: c.value },
				message: `found constant: ${c.value}`,
				artifacts: [],
			})),
	}),
	describeArtifact: (artifact) => ({ value: String(artifact.data) }),
};

export default {
	collectors: [observingCollector],
	rules: [constantsRule],
};
