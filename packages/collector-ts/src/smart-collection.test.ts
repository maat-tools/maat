import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { CONSTANTS_CAPABILITY, DEPENDS_ON_CAPABILITY, FUNCTION_SIGNATURES_CAPABILITY } from '@maat-tools/vocabulary';
import type { TSCollectedFacts } from './index';
import { TSCollector } from './index';

const FIXTURE_TSCONFIG = resolve(import.meta.dir, '../../../tests/fixtures/sample-project/tsconfig.json');

describe('TSCollector.collect() — smart fact selection via requiredFactKeys', () => {
	function requiredKeys(...keys: (keyof TSCollectedFacts)[]): Set<keyof TSCollectedFacts> {
		return new Set(keys);
	}

	test('collects only constants when requiredFactKeys contains only constants', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const facts = await collector.collect({ requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });

		expect(facts.constants.length).toBeGreaterThan(0);
		expect(facts.dependsOn).toHaveLength(0);
		expect(facts.functionSignatures).toHaveLength(0);
		expect(facts.positionalSources).toHaveLength(0);
		expect(facts.positionalAccesses).toHaveLength(0);
		expect(facts.algorithmicBindings).toHaveLength(0);
		expect(facts.callGraph.nodes).toHaveLength(0);
		expect(facts.callGraph.edges).toHaveLength(0);
	});

	test('collects only dependsOn when requiredFactKeys contains only dependsOn', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const facts = await collector.collect({ requiredFactKeys: requiredKeys(DEPENDS_ON_CAPABILITY) });

		expect(facts.constants).toHaveLength(0);
		expect(facts.dependsOn.length).toBeGreaterThan(0);
		expect(facts.functionSignatures).toHaveLength(0);
		expect(facts.callGraph.nodes).toHaveLength(0);
	});

	test('collects all facts when requiredFactKeys is omitted', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const facts = await collector.collect();

		expect(facts.constants.length).toBeGreaterThan(0);
		expect(facts.dependsOn.length).toBeGreaterThan(0);
		expect(facts.functionSignatures.length).toBeGreaterThan(0);
		expect(facts.callGraph.nodes.length).toBeGreaterThan(0);
	});

	test('collects multiple required categories', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const facts = await collector.collect({
			requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY, DEPENDS_ON_CAPABILITY),
		});

		expect(facts.constants.length).toBeGreaterThan(0);
		expect(facts.dependsOn.length).toBeGreaterThan(0);
		expect(facts.functionSignatures).toHaveLength(0);
		expect(facts.callGraph.nodes).toHaveLength(0);
	});

	test('skips expensive call graph collection when call graph is not required', async () => {
		const collector = new TSCollector({ tsConfigFilePath: FIXTURE_TSCONFIG });
		const facts = await collector.collect({
			requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY, DEPENDS_ON_CAPABILITY, FUNCTION_SIGNATURES_CAPABILITY),
		});

		expect(facts.constants.length).toBeGreaterThan(0);
		expect(facts.dependsOn.length).toBeGreaterThan(0);
		expect(facts.functionSignatures.length).toBeGreaterThan(0);
		expect(facts.callGraph.nodes).toHaveLength(0);
		expect(facts.callGraph.edges).toHaveLength(0);
	});
});
