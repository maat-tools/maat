import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { LLMInteractor } from './llm';
import { BaseLLMModel } from './llm/base';
import { BatchLLMRequest } from './llm/batch';
import type { JsonArraySchema, LLMConfig, LLMInput, LLMModel, LLMOutput, ModelCapabilities } from './llm/types';

const SCORE_SCHEMA: JsonArraySchema = {
	type: 'array',
	items: {
		type: 'object',
		properties: { score: { type: 'number' } },
	},
};

type FakeItem = { id: number; payload: string };
type FakeResult = { score: number };

class FakeModel extends BaseLLMModel implements LLMModel {
	public calls: LLMInput[] = [];
	protected modelCapabilities: ModelCapabilities;

	public constructor(caps: ModelCapabilities) {
		super();
		this.modelCapabilities = caps;
	}

	public getCapabilities(): ModelCapabilities {
		return this.modelCapabilities;
	}

	public async call(input: LLMInput): Promise<LLMOutput> {
		this.calls.push(input);
		const keys = [...(input.context ?? '').matchAll(/--- Item \d+ \(key: ([^)]+)\) ---/g)].map((m) => m[1] as string);
		const results = keys.map((k, i) => ({ _key: k, score: i }));
		return { response: JSON.stringify(results), usedTokens: keys.length, cost: keys.length };
	}
}

class TestInteractor extends LLMInteractor {
	protected id: string;

	public constructor(model: LLMModel, id: string) {
		super({
			provider: 'vertex',
			model: 'gemini-3-5-flash',
			extra: { project: 't', location: 'us-central1' },
		} as LLMConfig);
		this.id = id;
		this.modelInstance = model;
		(this as unknown as { batchRequest: BatchLLMRequest }).batchRequest = new BatchLLMRequest(model);
	}

	protected serializeItem(item: FakeItem): string {
		return `id:${item.id}|${item.payload}`;
	}

	public run(items: FakeItem[], options?: { useCache?: boolean }) {
		return this.batchedInteract<FakeItem, FakeResult>({
			items,
			instructions: 'Rate.',
			responseSchema: SCORE_SCHEMA,
			options,
		});
	}
}

const BIG_CAPS: ModelCapabilities = { maxInputTokens: 10_000, maxOutputTokens: 10_000 };

function findProjectRoot(start: string): string {
	let current = resolve(start);

	while (true) {
		if (existsSync(join(current, '.git'))) {
			return current;
		}

		const parent = dirname(current);
		if (parent === current) {
			throw new Error(`Could not find project root from ${start}`);
		}
		current = parent;
	}
}

const projectRoot = findProjectRoot(import.meta.dir);
const utilsPackageRoot = resolve(import.meta.dir, '..');

const createdIds: string[] = [];

function nextId(): string {
	const id = `enr-cache-loc-${Math.floor(Math.random() * 1_000_000_000)}`;
	createdIds.push(id);
	return id;
}

describe('LLMInteractor cache location', () => {
	const originalCwd = process.cwd();
	let workDir: string;

	beforeEach(() => {
		workDir = mkdtempSync(join(utilsPackageRoot, '.cache-loc-test-'));
		process.chdir(workDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);

		for (const id of createdIds.splice(0)) {
			rmSync(join(projectRoot, '.maat', 'cache', 'enrichers', id), { recursive: true, force: true });
		}

		rmSync(workDir, { recursive: true, force: true });
	});

	test('writes enricher cache at the project root, not inside the utils package working directory', async () => {
		const id = nextId();
		const interactor = new TestInteractor(new FakeModel(BIG_CAPS), id);
		await interactor.run([{ id: 0, payload: 'x' }]);

		const enricherDir = join(projectRoot, '.maat', 'cache', 'enrichers', id);
		expect(existsSync(enricherDir)).toBe(true);

		const files = readdirSync(enricherDir);
		expect(files).toHaveLength(1);
		expect(files[0]).toMatch(/^[a-f0-9]{64}\.json$/);

		expect(existsSync(join(workDir, '.maat'))).toBe(false);
	});

	test('uses the directory layout .maat/cache/enrichers/<id>/<hash>.json', async () => {
		const id = nextId();
		const interactor = new TestInteractor(new FakeModel(BIG_CAPS), id);
		await interactor.run([{ id: 1, payload: 'y' }]);

		const enricherDir = join(projectRoot, '.maat', 'cache', 'enrichers', id);
		const files = readdirSync(enricherDir);
		expect(files).toHaveLength(1);

		const fileName = files[0];
		if (!fileName) {
			throw new Error('Expected a cache file to be written');
		}
		expect(fileName).toMatch(/^[a-f0-9]{64}\.json$/);
		expect(existsSync(join(enricherDir, fileName))).toBe(true);
	});

	test('shares cache hits when the working directory changes within the repo', async () => {
		const id = nextId();
		const model1 = new FakeModel(BIG_CAPS);
		await new TestInteractor(model1, id).run([{ id: 0, payload: 'shared' }]);
		expect(model1.calls.length).toBe(1);

		const otherWorkDir = mkdtempSync(join(utilsPackageRoot, '.cache-loc-test-other-'));
		process.chdir(otherWorkDir);
		try {
			const model2 = new FakeModel(BIG_CAPS);
			const cached = await new TestInteractor(model2, id).run([{ id: 0, payload: 'shared' }]);
			expect(model2.calls.length).toBe(0);
			expect(cached.items).toHaveLength(1);
		} finally {
			process.chdir(workDir);
			rmSync(otherWorkDir, { recursive: true, force: true });
		}
	});

	test('cleans up stale entries inside the enricher directory', async () => {
		const id = nextId();
		const interactor = new TestInteractor(new FakeModel(BIG_CAPS), id);

		await interactor.run([
			{ id: 0, payload: 'a' },
			{ id: 1, payload: 'b' },
		]);

		const enricherDir = join(projectRoot, '.maat', 'cache', 'enrichers', id);
		expect(readdirSync(enricherDir)).toHaveLength(2);

		await interactor.run([{ id: 0, payload: 'a' }]);
		expect(readdirSync(enricherDir)).toHaveLength(1);
	});

	test('does not create a cache directory for empty input', async () => {
		const id = nextId();
		const interactor = new TestInteractor(new FakeModel(BIG_CAPS), id);
		const { items, usedTokens, cost } = await interactor.run([]);

		expect(items).toEqual([]);
		expect(usedTokens).toBe(0);
		expect(cost).toBe(0);
		expect(existsSync(join(projectRoot, '.maat', 'cache', 'enrichers', id))).toBe(false);
		expect(existsSync(join(workDir, '.maat'))).toBe(false);
	});

	test('keeps cache directories isolated per enricher id', async () => {
		const idA = nextId();
		const idB = nextId();
		const model = new FakeModel(BIG_CAPS);

		await new TestInteractor(model, idA).run([{ id: 0, payload: 'a' }]);
		await new TestInteractor(model, idB).run([{ id: 0, payload: 'b' }]);

		const enrichersRoot = join(projectRoot, '.maat', 'cache', 'enrichers');
		expect(existsSync(join(enrichersRoot, idA))).toBe(true);
		expect(existsSync(join(enrichersRoot, idB))).toBe(true);
		expect(readdirSync(join(enrichersRoot, idA))).toHaveLength(1);
		expect(readdirSync(join(enrichersRoot, idB))).toHaveLength(1);
	});
});
