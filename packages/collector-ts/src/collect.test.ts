import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CONSTANTS_CAPABILITY, DEPENDS_ON_CAPABILITY } from '@maat-tools/vocabulary';
import { collectASTFacts } from './collect';
import type { TSCollectedFacts, TSInput } from './index';

const FIXTURE_TSCONFIG = resolve(import.meta.dir, '../../../tests/fixtures/sample-project/tsconfig.json');
const NODE_MODULES_TSCONFIG = resolve(
	import.meta.dir,
	'../../../tests/fixtures/project-with-node-modules/tsconfig.json',
);
const CACHE_DIR = resolve(process.cwd(), '.maat/cache/collector-ts/ast-facts');

function clearCollectorTsCache(): void {
	if (existsSync(CACHE_DIR)) {
		rmSync(CACHE_DIR, { recursive: true, force: true });
	}
}

function getCacheFiles(fact: string): string[] {
	const dir = join(CACHE_DIR, fact);
	if (!existsSync(dir)) {
		return [];
	}
	return readdirSync(dir);
}

async function runCollectASTFacts(
	tsConfigPath: string,
	options: { requiredFactKeys?: Set<keyof TSCollectedFacts>; config?: Partial<TSInput>; projectRoot?: string } = {},
) {
	return collectASTFacts({
		tsConfigPath,
		config: { tsConfigFilePath: tsConfigPath, ...(options.config ?? {}) },
		projectRoot: options.projectRoot ?? process.cwd(),
		requiredFactKeys: options.requiredFactKeys,
	});
}

function requiredKeys(...keys: (keyof TSCollectedFacts)[]): Set<keyof TSCollectedFacts> {
	return new Set(keys);
}

describe('collectASTFacts() — single tsconfig', () => {
	test('collects constants from the fixture project', async () => {
		const { constants } = await runCollectASTFacts(FIXTURE_TSCONFIG);
		expect(constants.length).toBeGreaterThan(0);
	});

	test('collects dependsOn from the fixture project', async () => {
		const { dependsOn } = await runCollectASTFacts(FIXTURE_TSCONFIG);
		expect(dependsOn.length).toBeGreaterThan(0);
	});
});

describe('collectASTFacts() — exclude patterns', () => {
	test('excludes files matching the exclude patterns', async () => {
		const originalCwd = process.cwd();
		const workspaceRoot = resolve(import.meta.dir, '../../..');
		process.chdir(workspaceRoot);
		try {
			const { constants } = await runCollectASTFacts(FIXTURE_TSCONFIG, {
				config: { exclude: ['**/positional.ts'] },
			});
			const files = constants.map((c) => c.location.file);
			expect(files.some((f) => f.endsWith('positional.ts'))).toBe(false);
		} finally {
			process.chdir(originalCwd);
		}
	});
});

describe('collectASTFacts() — smart fact selection via requiredFactKeys', () => {
	test('collects only constants when only constants are required', async () => {
		const facts = await runCollectASTFacts(FIXTURE_TSCONFIG, {
			requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY),
		});

		expect(facts.constants.length).toBeGreaterThan(0);
		expect(facts.dependsOn).toHaveLength(0);
		expect(facts.functionSignatures).toHaveLength(0);
		expect(facts.positionalSources).toHaveLength(0);
		expect(facts.positionalAccesses).toHaveLength(0);
		expect(facts.algorithmicBindings).toHaveLength(0);
	});

	test('collects only dependsOn when only dependsOn is required', async () => {
		const facts = await runCollectASTFacts(FIXTURE_TSCONFIG, {
			requiredFactKeys: requiredKeys(DEPENDS_ON_CAPABILITY),
		});

		expect(facts.constants).toHaveLength(0);
		expect(facts.dependsOn.length).toBeGreaterThan(0);
		expect(facts.functionSignatures).toHaveLength(0);
		expect(facts.positionalSources).toHaveLength(0);
		expect(facts.positionalAccesses).toHaveLength(0);
		expect(facts.algorithmicBindings).toHaveLength(0);
	});

	test('collects multiple required fact categories', async () => {
		const facts = await runCollectASTFacts(FIXTURE_TSCONFIG, {
			requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY, DEPENDS_ON_CAPABILITY),
		});

		expect(facts.constants.length).toBeGreaterThan(0);
		expect(facts.dependsOn.length).toBeGreaterThan(0);
		expect(facts.functionSignatures).toHaveLength(0);
		expect(facts.positionalSources).toHaveLength(0);
		expect(facts.positionalAccesses).toHaveLength(0);
		expect(facts.algorithmicBindings).toHaveLength(0);
	});

	test('collects every per-file fact category when requiredFactKeys is omitted', async () => {
		const facts = await runCollectASTFacts(FIXTURE_TSCONFIG);

		expect(facts.constants.length).toBeGreaterThan(0);
		expect(facts.dependsOn.length).toBeGreaterThan(0);
		expect(facts.functionSignatures.length).toBeGreaterThan(0);
		expect(facts.positionalSources.length).toBeGreaterThan(0);
		expect(facts.positionalAccesses.length).toBeGreaterThan(0);
		expect(facts.algorithmicBindings).toBeDefined();
	});
});

describe('collectASTFacts() — node_modules / external library files', () => {
	test('skips source files located in node_modules even when included by tsconfig', async () => {
		const { constants } = await runCollectASTFacts(NODE_MODULES_TSCONFIG);
		const values = constants.map((c) => c.value);

		expect(values).toContain('app');
		expect(values).not.toContain('lib');
	});

	test('does not report paths inside node_modules', async () => {
		const { constants } = await runCollectASTFacts(NODE_MODULES_TSCONFIG);
		const files = constants.map((c) => c.location.file);

		expect(files.some((f) => f.includes('node_modules'))).toBe(false);
	});
});

describe('collectASTFacts() — cache', () => {
	beforeEach(() => {
		clearCollectorTsCache();
	});

	afterEach(() => {
		clearCollectorTsCache();
	});

	test('writes a cache entry for each collected fact', async () => {
		await runCollectASTFacts(FIXTURE_TSCONFIG, {
			requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY, DEPENDS_ON_CAPABILITY),
		});

		expect(getCacheFiles('constants').length).toBeGreaterThan(0);
		expect(getCacheFiles('depends-on').length).toBeGreaterThan(0);

		for (const file of getCacheFiles('constants')) {
			const content = readFileSync(join(CACHE_DIR, 'constants', file), 'utf-8');
			expect(Array.isArray(JSON.parse(content))).toBe(true);
		}
	});

	test('reads cached results instead of re-collecting on subsequent runs', async () => {
		await runCollectASTFacts(FIXTURE_TSCONFIG, {
			requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY),
		});

		for (const file of getCacheFiles('constants')) {
			writeFileSync(join(CACHE_DIR, 'constants', file), JSON.stringify([]));
		}

		const { constants } = await runCollectASTFacts(FIXTURE_TSCONFIG, {
			requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY),
		});

		expect(constants).toHaveLength(0);
	});

	test('prunes stale cache entries that are no longer used', async () => {
		await runCollectASTFacts(FIXTURE_TSCONFIG, {
			requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY),
		});

		const staleFile = join(CACHE_DIR, 'constants', 'stale-cache-entry.json');
		writeFileSync(staleFile, JSON.stringify([{ value: 'stale' }]));

		await runCollectASTFacts(FIXTURE_TSCONFIG, {
			requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY),
		});

		expect(existsSync(staleFile)).toBe(false);
	});

	test('invalidates cache when file content changes', async () => {
		const tmpDir = resolve('/tmp/opencode/collector-ts-cache-test');
		await rm(tmpDir, { recursive: true, force: true });
		await mkdir(join(tmpDir, 'src'), { recursive: true });
		const tsConfigPath = join(tmpDir, 'tsconfig.json');
		const sourcePath = join(tmpDir, 'src/index.ts');

		await writeFile(
			tsConfigPath,
			JSON.stringify({
				compilerOptions: { target: 'ESNext', module: 'ESNext', moduleResolution: 'node' },
				include: ['src/**/*.ts'],
			}),
		);
		await writeFile(sourcePath, 'export const FIRST = 1;\n');

		const first = await runCollectASTFacts(tsConfigPath, {
			requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY),
			projectRoot: tmpDir,
		});
		expect(first.constants.map((c) => c.value)).toContain('1');

		await writeFile(sourcePath, 'export const FIRST = 1;\nexport const SECOND = 2;\n');

		const second = await runCollectASTFacts(tsConfigPath, {
			requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY),
			projectRoot: tmpDir,
		});
		expect(second.constants.map((c) => c.value)).toContain('1');
		expect(second.constants.map((c) => c.value)).toContain('2');

		await rm(tmpDir, { recursive: true, force: true });
	});

	test('does not create cache entries for facts that are not required', async () => {
		await runCollectASTFacts(FIXTURE_TSCONFIG, {
			requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY),
		});

		expect(getCacheFiles('constants').length).toBeGreaterThan(0);
		expect(getCacheFiles('depends-on')).toHaveLength(0);
	});
});
