import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { resolveProjectRoot } from '@maat-tools/utils';
import {
	ALGORITHMIC_BINDINGS_CAPABILITY,
	type AlgorithmicPattern,
	CONSTANTS_CAPABILITY,
	DEPENDS_ON_CAPABILITY,
	FUNCTION_SIGNATURES_CAPABILITY,
	POSITIONAL_ACCESSES_CAPABILITY,
	POSITIONAL_SOURCES_CAPABILITY,
} from '@maat-tools/vocabulary';
import { collectASTFacts } from './collect';
import type { TSCollectedFacts, TSInput } from './index';

const CACHE_ROOT = join(resolveProjectRoot(), '.maat', 'cache', 'collector-ts');

const NODE_MODULES_TSCONFIG = resolve(
	import.meta.dir,
	'../../../tests/fixtures/project-with-node-modules/tsconfig.json',
);

const tmpDirs: string[] = [];

function clearCache(): void {
	rmSync(CACHE_ROOT, { recursive: true, force: true });
}

function listCacheFiles(): string[] {
	const out: string[] = [];
	const walk = (dir: string): void => {
		if (!existsSync(dir)) {
			return;
		}
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.name.endsWith('.json')) {
				out.push(full);
			}
		}
	};
	walk(CACHE_ROOT);
	return out;
}

function makeProject(files: Record<string, string>): { dir: string; tsConfigPath: string } {
	const dir = mkdtempSync(join(tmpdir(), 'maat-collect-'));
	tmpDirs.push(dir);
	mkdirSync(join(dir, 'src'), { recursive: true });
	for (const [name, content] of Object.entries(files)) {
		writeFileSync(join(dir, 'src', name), content);
	}
	const tsConfigPath = join(dir, 'tsconfig.json');
	writeFileSync(
		tsConfigPath,
		JSON.stringify({
			compilerOptions: {
				target: 'ESNext',
				module: 'ESNext',
				moduleResolution: 'node',
				skipLibCheck: true,
				noEmit: true,
			},
			include: ['src/**/*.ts'],
		}),
	);
	return { dir, tsConfigPath };
}

function run(
	tsConfigPath: string,
	options: {
		projectRoot?: string;
		requiredFactKeys?: Set<keyof TSCollectedFacts>;
		config?: Partial<TSInput>;
	} = {},
) {
	return collectASTFacts({
		tsConfigPath,
		config: { tsConfigFilePath: tsConfigPath, ...(options.config ?? {}) },
		projectRoot: options.projectRoot ?? resolve(tsConfigPath, '..'),
		requiredFactKeys: options.requiredFactKeys,
	});
}

function requiredKeys(...keys: (keyof TSCollectedFacts)[]): Set<keyof TSCollectedFacts> {
	return new Set(keys);
}

/** Order-insensitive deep equality for a fact array (cache vs fresh ordering can differ). */
function sortedJson(values: unknown[]): string[] {
	return values.map((v) => JSON.stringify(v)).sort();
}

const FILE_WITH_CONSTANTS = "export const GREETING = 'hello world';\nexport const COUNT = 42;\n";
const FILE_WITH_IMPORT = "import { readFileSync } from 'node:fs';\nexport const reader = readFileSync;\n";
const FILE_WITHOUT_FACTS = 'export type Empty = { flag: boolean };\n';

beforeEach(() => {
	clearCache();
});

afterEach(() => {
	clearCache();
	while (tmpDirs.length > 0) {
		const dir = tmpDirs.pop();
		if (dir) {
			rmSync(dir, { recursive: true, force: true });
		}
	}
});

describe('collectASTFacts() — collection & routing', () => {
	test('collects constants from a source file', async () => {
		const { tsConfigPath } = makeProject({ 'a.ts': FILE_WITH_CONSTANTS });

		const { constants } = await run(tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });

		expect(constants.map((c) => c.value)).toEqual(expect.arrayContaining(['hello world', '42']));
	});

	test('collects dependsOn from imports', async () => {
		const { tsConfigPath } = makeProject({ 'a.ts': FILE_WITH_IMPORT });

		const { dependsOn } = await run(tsConfigPath, { requiredFactKeys: requiredKeys(DEPENDS_ON_CAPABILITY) });

		expect(dependsOn.length).toBeGreaterThan(0);
		expect(dependsOn.some((d) => d.to.path === 'node:fs')).toBe(true);
	});

	test('collects every capability when requiredFactKeys is omitted', async () => {
		const { tsConfigPath } = makeProject({ 'a.ts': `${FILE_WITH_CONSTANTS}${FILE_WITH_IMPORT}` });

		const facts = await run(tsConfigPath);

		expect(facts.constants.length).toBeGreaterThan(0);
		expect(facts.dependsOn.length).toBeGreaterThan(0);
		for (const key of [
			ALGORITHMIC_BINDINGS_CAPABILITY,
			CONSTANTS_CAPABILITY,
			DEPENDS_ON_CAPABILITY,
			FUNCTION_SIGNATURES_CAPABILITY,
			POSITIONAL_ACCESSES_CAPABILITY,
			POSITIONAL_SOURCES_CAPABILITY,
		] as const) {
			expect(Array.isArray(facts[key])).toBe(true);
		}
	});

	test('requiredFactKeys restricts collection to the requested capabilities', async () => {
		const { tsConfigPath } = makeProject({ 'a.ts': `${FILE_WITH_CONSTANTS}${FILE_WITH_IMPORT}` });

		const facts = await run(tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });

		expect(facts.constants.length).toBeGreaterThan(0);
		expect(facts.dependsOn).toHaveLength(0);
		expect(facts.functionSignatures).toHaveLength(0);
	});

	test('aggregates facts across multiple files', async () => {
		const single = makeProject({ 'a.ts': FILE_WITH_CONSTANTS });
		const singleFacts = await run(single.tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });

		const double = makeProject({ 'a.ts': FILE_WITH_CONSTANTS, 'b.ts': FILE_WITH_CONSTANTS });
		const doubleFacts = await run(double.tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });

		expect(doubleFacts.constants.length).toBe(singleFacts.constants.length * 2);
	});

	test('returns empty arrays for a project with no matching facts', async () => {
		const { tsConfigPath } = makeProject({ 'a.ts': FILE_WITHOUT_FACTS });

		const facts = await run(tsConfigPath);

		expect(facts.constants).toHaveLength(0);
		expect(facts.dependsOn).toHaveLength(0);
		expect(facts.functionSignatures).toHaveLength(0);
		expect(facts.positionalSources).toHaveLength(0);
		expect(facts.positionalAccesses).toHaveLength(0);
		expect(facts.algorithmicBindings).toHaveLength(0);
	});

	test('collects from more files than the batch size', async () => {
		const files: Record<string, string> = {};
		for (let i = 0; i < 25; i++) {
			files[`f${i}.ts`] = `export const V${i} = 'value-${i}';\n`;
		}
		const { tsConfigPath } = makeProject(files);

		const { constants } = await run(tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });

		const values = constants.map((c) => c.value);
		for (let i = 0; i < 25; i++) {
			expect(values).toContain(`value-${i}`);
		}
	});
});

describe('collectASTFacts() — exclude patterns', () => {
	test('excluded files contribute no facts', async () => {
		const { tsConfigPath } = makeProject({
			'keep.ts': "export const KEPT = 'KEEP_MARKER';\n",
			'skip.test.ts': "export const SKIPPED = 'EXCLUDE_MARKER';\n",
		});

		const { constants } = await run(tsConfigPath, {
			requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY),
			config: { exclude: ['**/*.test.ts'] },
		});

		const values = constants.map((c) => c.value);
		expect(values).toContain('KEEP_MARKER');
		expect(values).not.toContain('EXCLUDE_MARKER');
	});

	test('collects from a file that does not match the exclude pattern', async () => {
		const { tsConfigPath } = makeProject({ 'keep.ts': "export const KEPT = 'KEEP_MARKER';\n" });

		const { constants } = await run(tsConfigPath, {
			requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY),
			config: { exclude: ['**/*.spec.ts'] },
		});

		expect(constants.map((c) => c.value)).toContain('KEEP_MARKER');
	});
});

describe('collectASTFacts() — node_modules / external library files', () => {
	test('skips source files located in node_modules even when included by tsconfig', async () => {
		const { constants } = await run(NODE_MODULES_TSCONFIG);
		const values = constants.map((c) => c.value);

		expect(values).toContain('app');
		expect(values).not.toContain('lib');
	});

	test('does not report paths inside node_modules', async () => {
		const { constants } = await run(NODE_MODULES_TSCONFIG);

		expect(constants.some((c) => c.location.file.includes('node_modules'))).toBe(false);
	});
});

describe('collectASTFacts() — cache population', () => {
	test('writes cache entries on the first run', async () => {
		const { tsConfigPath } = makeProject({ 'a.ts': FILE_WITH_CONSTANTS });
		expect(listCacheFiles()).toHaveLength(0);

		await run(tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });

		expect(listCacheFiles().length).toBeGreaterThan(0);
	});

	test('only creates cache for the requested capabilities', async () => {
		const { tsConfigPath } = makeProject({ 'a.ts': `${FILE_WITH_CONSTANTS}${FILE_WITH_IMPORT}` });

		await run(tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });

		const cacheFiles = listCacheFiles();
		expect(cacheFiles.length).toBeGreaterThan(0);
		expect(cacheFiles.some((p) => p.includes(`${sep}${CONSTANTS_CAPABILITY}${sep}`))).toBe(true);
		expect(cacheFiles.some((p) => p.includes(`${sep}${DEPENDS_ON_CAPABILITY}${sep}`))).toBe(false);
	});

	test('caches empty results so a file with no facts is still recorded', async () => {
		const { tsConfigPath } = makeProject({ 'a.ts': FILE_WITHOUT_FACTS });

		const facts = await run(tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });

		expect(facts.constants).toHaveLength(0);
		expect(listCacheFiles().length).toBeGreaterThan(0);
	});
});

describe('collectASTFacts() — cache reuse & invalidation', () => {
	test('a second run with no changes returns the same facts', async () => {
		const { tsConfigPath } = makeProject({ 'a.ts': `${FILE_WITH_CONSTANTS}${FILE_WITH_IMPORT}` });

		const first = await run(tsConfigPath);
		const second = await run(tsConfigPath);

		expect(sortedJson(second.constants)).toEqual(sortedJson(first.constants));
		expect(sortedJson(second.dependsOn)).toEqual(sortedJson(first.dependsOn));
	});

	test('is served from cache rather than re-derived when the cache is present', async () => {
		const { tsConfigPath } = makeProject({ 'a.ts': FILE_WITH_CONSTANTS });

		const first = await run(tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });
		expect(first.constants.length).toBeGreaterThan(0);

		// Tamper every cache entry in place (same content hash → same filename → still a hit).
		for (const cacheFile of listCacheFiles()) {
			writeFileSync(cacheFile, JSON.stringify([]));
		}

		const second = await run(tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });
		expect(second.constants).toHaveLength(0);
	});

	test('serves an already-cached fact from cache while collecting a newly-required one', async () => {
		const { tsConfigPath } = makeProject({ 'a.ts': `${FILE_WITH_CONSTANTS}${FILE_WITH_IMPORT}` });

		// Populate the cache for constants only, then tamper it so a hit is observable.
		await run(tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });
		for (const cacheFile of listCacheFiles()) {
			writeFileSync(cacheFile, JSON.stringify([]));
		}

		const facts = await run(tsConfigPath, {
			requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY, DEPENDS_ON_CAPABILITY),
		});

		expect(facts.constants).toHaveLength(0); // served from the tampered constants cache
		expect(facts.dependsOn.length).toBeGreaterThan(0); // dependsOn was never cached → freshly collected
	});

	test('recomputes only the changed file and serves the rest from cache', async () => {
		const { dir, tsConfigPath } = makeProject({
			'a.ts': "export const A = 'A1';\n",
			'b.ts': "export const B = 'B1';\n",
		});

		await run(tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });

		// Change only a's content (new hash → miss → recompute); tamper all cache entries to [].
		// b is unchanged (same hash → hit → reads the tampered empty entry).
		writeFileSync(join(dir, 'src', 'a.ts'), "export const A = 'A2';\n");
		for (const cacheFile of listCacheFiles()) {
			writeFileSync(cacheFile, JSON.stringify([]));
		}

		const { constants } = await run(tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });
		const values = constants.map((c) => c.value);
		expect(values).toContain('A2'); // recomputed fresh
		expect(values).not.toContain('B1'); // served from the tampered cache
	});

	test('recollects when a file content changes', async () => {
		const { dir, tsConfigPath } = makeProject({ 'a.ts': "export const VALUE = 'V1';\n" });

		const first = await run(tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });
		expect(first.constants.map((c) => c.value)).toContain('V1');

		writeFileSync(join(dir, 'src', 'a.ts'), "export const VALUE = 'V2';\n");

		const second = await run(tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });
		const values = second.constants.map((c) => c.value);
		expect(values).toContain('V2');
		expect(values).not.toContain('V1');
	});

	test('cacheContext (algorithmicPatterns) is part of the cache key', async () => {
		const { tsConfigPath } = makeProject({ 'a.ts': FILE_WITH_CONSTANTS });

		const patternsA: AlgorithmicPattern[] = [
			{ id: 'a', roles: ['r'], matchers: [{ role: 'r', functionPattern: 'foo' }] },
		];
		const patternsB: AlgorithmicPattern[] = [
			{ id: 'b', roles: ['r'], matchers: [{ role: 'r', functionPattern: 'bar' }] },
		];

		await run(tsConfigPath, {
			requiredFactKeys: requiredKeys(ALGORITHMIC_BINDINGS_CAPABILITY),
			config: { algorithmicPatterns: patternsA },
		});
		const namesA = listCacheFiles()
			.map((p) => p.split(sep).pop())
			.sort();

		await run(tsConfigPath, {
			requiredFactKeys: requiredKeys(ALGORITHMIC_BINDINGS_CAPABILITY),
			config: { algorithmicPatterns: patternsB },
		});
		const namesB = listCacheFiles()
			.map((p) => p.split(sep).pop())
			.sort();

		// Different patterns must hash to different cache entries.
		expect(namesA).not.toEqual(namesB);
	});
});

describe('collectASTFacts() — stale entry pruning', () => {
	test('prunes a cache entry that is no longer produced', async () => {
		const { tsConfigPath } = makeProject({ 'a.ts': FILE_WITH_CONSTANTS });

		await run(tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });

		// Drop an orphan entry alongside a real one, in a capability dir the run owns.
		const [anyCacheFile] = listCacheFiles();
		if (!anyCacheFile) {
			throw new Error('expected at least one cache entry after a run');
		}
		const orphan = join(anyCacheFile, '..', 'stale-orphan.json');
		writeFileSync(orphan, JSON.stringify([{ stale: true }]));
		expect(existsSync(orphan)).toBe(true);

		await run(tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });

		expect(existsSync(orphan)).toBe(false);
	});

	test('removing a source file drops its facts and prunes its cache', async () => {
		const { dir, tsConfigPath } = makeProject({
			'a.ts': "export const KEEP = 'A_VALUE';\n",
			'b.ts': "export const GONE = 'B_VALUE';\n",
		});

		const first = await run(tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });
		expect(first.constants.map((c) => c.value)).toContain('B_VALUE');
		const cacheCountBefore = listCacheFiles().length;

		rmSync(join(dir, 'src', 'b.ts'));

		const second = await run(tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });
		const values = second.constants.map((c) => c.value);
		expect(values).toContain('A_VALUE');
		expect(values).not.toContain('B_VALUE');
		expect(listCacheFiles().length).toBeLessThan(cacheCountBefore);
	});
});

describe('collectASTFacts() — per-tsconfig cache isolation', () => {
	test('running one tsconfig does not prune another tsconfig cache (regression)', async () => {
		const projectA = makeProject({ 'a.ts': "export const A = 'from-a';\n" });
		const projectB = makeProject({ 'b.ts': "export const B = 'from-b';\n" });

		await run(projectA.tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });
		await run(projectB.tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });

		const cacheAfterBoth = new Set(listCacheFiles());
		expect(cacheAfterBoth.size).toBeGreaterThan(0);

		// Re-running A must not delete anything that belongs to B.
		await run(projectA.tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });

		for (const cacheFile of cacheAfterBoth) {
			expect(existsSync(cacheFile)).toBe(true);
		}
	});

	test('the same file under two tsconfigs is cached independently', async () => {
		const shared = "export const SHARED = 'shared-value';\n";
		const projectA = makeProject({ 'a.ts': shared });
		const projectB = makeProject({ 'a.ts': shared });

		await run(projectA.tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });
		const afterA = listCacheFiles().length;

		await run(projectB.tsConfigPath, { requiredFactKeys: requiredKeys(CONSTANTS_CAPABILITY) });
		const afterB = listCacheFiles().length;

		// B adds its own namespace rather than reusing/overwriting A's.
		expect(afterB).toBeGreaterThan(afterA);
	});
});
