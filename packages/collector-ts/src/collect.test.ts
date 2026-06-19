import { describe, expect, test } from 'bun:test';
import { isAbsolute, relative, resolve } from 'node:path';
import { CALL_GRAPH_CAPABILITY, CONSTANTS_CAPABILITY, DEPENDS_ON_CAPABILITY } from '@maat-tools/vocabulary';
import type { TSCollectedFacts } from './collect';
import { runCollect } from './collect';

const FIXTURE_TSCONFIG = resolve(import.meta.dir, '../../../tests/fixtures/sample-project/tsconfig.json');
const MULTI_PROJECT_ROOT = resolve(import.meta.dir, '../../../tests/fixtures/multi-project');
const MULTI_PKG_A_TSCONFIG = resolve(MULTI_PROJECT_ROOT, 'pkg-a/tsconfig.json');
const MULTI_PKG_B_TSCONFIG = resolve(MULTI_PROJECT_ROOT, 'pkg-b/tsconfig.json');
const NODE_MODULES_TSCONFIG = resolve(
	import.meta.dir,
	'../../../tests/fixtures/project-with-node-modules/tsconfig.json',
);

describe('runCollect() — single tsconfig', () => {
	test('collects constants from the fixture project', async () => {
		const { constants } = await runCollect({ config: { tsConfigFilePath: FIXTURE_TSCONFIG } });
		expect(constants.length).toBeGreaterThan(0);
	});

	test('collects dependsOn from the fixture project', async () => {
		const { dependsOn } = await runCollect({ config: { tsConfigFilePath: FIXTURE_TSCONFIG } });
		expect(dependsOn.length).toBeGreaterThan(0);
	});
});

describe('runCollect() — array of tsconfigs', () => {
	test('collects constants from both packages', async () => {
		const { constants } = await runCollect({
			config: { tsConfigFilePath: [MULTI_PKG_A_TSCONFIG, MULTI_PKG_B_TSCONFIG] },
		});
		const values = constants.map((c) => c.value);
		expect(values).toContain('admin');
		expect(values).toContain('active');
	});

	test('deduplicates files included in multiple tsconfigs', async () => {
		const { constants } = await runCollect({
			config: { tsConfigFilePath: [MULTI_PKG_A_TSCONFIG, MULTI_PKG_B_TSCONFIG] },
		});
		const pkgBConstants = constants.filter((c) => c.location.file.includes('pkg-b'));
		const activeOccurrences = pkgBConstants.filter((c) => c.value === 'active');
		expect(activeOccurrences).toHaveLength(1);
	});

	test('paths from all tsconfigs are relative to process.cwd()', async () => {
		const { constants } = await runCollect({
			config: { tsConfigFilePath: [MULTI_PKG_A_TSCONFIG, MULTI_PKG_B_TSCONFIG] },
		});
		const files = constants.map((c) => c.location.file);
		expect(files).toContain(
			relative(process.cwd(), resolve(MULTI_PROJECT_ROOT, 'pkg-a/src/index.ts')).replace(/\\/g, '/'),
		);
		expect(files).toContain(
			relative(process.cwd(), resolve(MULTI_PROJECT_ROOT, 'pkg-b/src/index.ts')).replace(/\\/g, '/'),
		);
		for (const file of files) {
			expect(isAbsolute(file)).toBe(false);
		}
	});
});

describe('runCollect() — glob in tsConfigFilePath', () => {
	test('glob expands to all matching tsconfigs', async () => {
		const { constants } = await runCollect({
			config: { tsConfigFilePath: `${MULTI_PROJECT_ROOT}/*/tsconfig.json` },
		});
		const values = constants.map((c) => c.value);
		expect(values).toContain('admin');
		expect(values).toContain('active');
	});

	test('glob result paths are relative to process.cwd()', async () => {
		const { constants } = await runCollect({
			config: { tsConfigFilePath: `${MULTI_PROJECT_ROOT}/*/tsconfig.json` },
		});
		const files = constants.map((c) => c.location.file);
		expect(files).toContain(
			relative(process.cwd(), resolve(MULTI_PROJECT_ROOT, 'pkg-a/src/index.ts')).replace(/\\/g, '/'),
		);
		expect(files).toContain(
			relative(process.cwd(), resolve(MULTI_PROJECT_ROOT, 'pkg-b/src/index.ts')).replace(/\\/g, '/'),
		);
	});

	test('glob deduplicates overlapping files', async () => {
		const { constants } = await runCollect({
			config: { tsConfigFilePath: `${MULTI_PROJECT_ROOT}/*/tsconfig.json` },
		});
		const activeOccurrences = constants.filter((c) => c.value === 'active');
		expect(activeOccurrences).toHaveLength(1);
	});
});

describe('runCollect() — exclude patterns', () => {
	test('excludes files matching the exclude patterns', async () => {
		const originalCwd = process.cwd();
		const workspaceRoot = resolve(import.meta.dir, '../../..');
		process.chdir(workspaceRoot);
		try {
			const { constants } = await runCollect({
				config: {
					tsConfigFilePath: FIXTURE_TSCONFIG,
					exclude: ['**/positional.ts'],
				},
			});
			const files = constants.map((c) => c.location.file);
			expect(files.some((f) => f.endsWith('positional.ts'))).toBe(false);
		} finally {
			process.chdir(originalCwd);
		}
	});
});

describe('runCollect() — smart fact selection via requiredFactKeys', () => {
	function requiredKeys(...keys: (keyof TSCollectedFacts)[]): Set<keyof TSCollectedFacts> {
		return new Set(keys);
	}

	test('collects only constants when only constants are required', async () => {
		const facts = await runCollect({
			config: { tsConfigFilePath: FIXTURE_TSCONFIG },
			requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY),
		});

		expect(facts.constants.length).toBeGreaterThan(0);
		expect(facts.dependsOn).toHaveLength(0);
		expect(facts.functionSignatures).toHaveLength(0);
		expect(facts.positionalSources).toHaveLength(0);
		expect(facts.positionalAccesses).toHaveLength(0);
		expect(facts.algorithmicBindings).toHaveLength(0);
		expect(facts.callGraph.nodes).toHaveLength(0);
		expect(facts.callGraph.edges).toHaveLength(0);
	});

	test('collects only dependsOn when only dependsOn is required', async () => {
		const facts = await runCollect({
			config: { tsConfigFilePath: FIXTURE_TSCONFIG },
			requiredFactKeys: requiredKeys(DEPENDS_ON_CAPABILITY),
		});

		expect(facts.constants).toHaveLength(0);
		expect(facts.dependsOn.length).toBeGreaterThan(0);
		expect(facts.functionSignatures).toHaveLength(0);
		expect(facts.positionalSources).toHaveLength(0);
		expect(facts.positionalAccesses).toHaveLength(0);
		expect(facts.algorithmicBindings).toHaveLength(0);
		expect(facts.callGraph.nodes).toHaveLength(0);
		expect(facts.callGraph.edges).toHaveLength(0);
	});

	test('collects multiple required fact categories', async () => {
		const facts = await runCollect({
			config: { tsConfigFilePath: FIXTURE_TSCONFIG },
			requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY, DEPENDS_ON_CAPABILITY),
		});

		expect(facts.constants.length).toBeGreaterThan(0);
		expect(facts.dependsOn.length).toBeGreaterThan(0);
		expect(facts.functionSignatures).toHaveLength(0);
		expect(facts.callGraph.nodes).toHaveLength(0);
	});

	test('collects call graph only when required', async () => {
		const facts = await runCollect({
			config: { tsConfigFilePath: FIXTURE_TSCONFIG },
			requiredFactKeys: requiredKeys(CALL_GRAPH_CAPABILITY),
		});

		expect(facts.constants).toHaveLength(0);
		expect(facts.dependsOn).toHaveLength(0);
		expect(facts.callGraph.nodes.length).toBeGreaterThan(0);
	});

	test('collects every fact category when requiredFactKeys is omitted', async () => {
		const facts = await runCollect({ config: { tsConfigFilePath: FIXTURE_TSCONFIG } });

		expect(facts.constants.length).toBeGreaterThan(0);
		expect(facts.dependsOn.length).toBeGreaterThan(0);
		expect(facts.functionSignatures.length).toBeGreaterThan(0);
		expect(facts.positionalSources.length).toBeGreaterThan(0);
		expect(facts.positionalAccesses.length).toBeGreaterThan(0);
		expect(facts.algorithmicBindings).toBeDefined();
		expect(facts.callGraph.nodes.length).toBeGreaterThan(0);
	});

	test('skips all per-file collection when no per-file facts are required', async () => {
		const facts = await runCollect({
			config: { tsConfigFilePath: FIXTURE_TSCONFIG },
			requiredFactKeys: requiredKeys(CALL_GRAPH_CAPABILITY),
		});

		expect(facts.constants).toHaveLength(0);
		expect(facts.dependsOn).toHaveLength(0);
		expect(facts.functionSignatures).toHaveLength(0);
		expect(facts.positionalSources).toHaveLength(0);
		expect(facts.positionalAccesses).toHaveLength(0);
		expect(facts.algorithmicBindings).toHaveLength(0);
		expect(facts.callGraph.nodes.length).toBeGreaterThan(0);
	});
});

describe('runCollect() — node_modules / external library files', () => {
	test('skips source files located in node_modules even when included by tsconfig', async () => {
		const { constants } = await runCollect({ config: { tsConfigFilePath: NODE_MODULES_TSCONFIG } });
		const values = constants.map((c) => c.value);

		expect(values).toContain('app');
		expect(values).not.toContain('lib');
	});

	test('does not report paths inside node_modules', async () => {
		const { constants } = await runCollect({ config: { tsConfigFilePath: NODE_MODULES_TSCONFIG } });
		const files = constants.map((c) => c.location.file);

		expect(files.some((f) => f.includes('node_modules'))).toBe(false);
	});
});
