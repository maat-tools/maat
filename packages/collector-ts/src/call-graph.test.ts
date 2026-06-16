import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { collectCallGraph } from './call-graph';

const WORKSPACE_ROOT = resolve(import.meta.dir, '../../..');
const FIXTURE_ROOT = resolve(WORKSPACE_ROOT, 'tests/fixtures/sample-project');
const ENTRY_FILES = [
	resolve(FIXTURE_ROOT, 'src/index.ts'),
	resolve(FIXTURE_ROOT, 'src/user.ts'),
	resolve(FIXTURE_ROOT, 'src/permissions.ts'),
	resolve(FIXTURE_ROOT, 'src/positional.ts'),
	resolve(FIXTURE_ROOT, 'src/remote.ts'),
];

describe('collectCallGraph()', () => {
	test('returns callGraph with expected structure', async () => {
		const callGraph = await collectCallGraph(ENTRY_FILES, WORKSPACE_ROOT, {});
		expect(Array.isArray(callGraph.nodes)).toBe(true);
		expect(Array.isArray(callGraph.edges)).toBe(true);
	});

	test('nodes have file-relative paths', async () => {
		const callGraph = await collectCallGraph(ENTRY_FILES, WORKSPACE_ROOT, {});
		for (const node of callGraph.nodes) {
			expect(node.file.startsWith('/')).toBe(false);
			expect(node.file).toContain('sample-project');
			expect(node.id).toContain(':');
			expect(node.location.line).toBeGreaterThan(0);
		}
	});

	test('edges reference existing caller and callee nodes', async () => {
		const callGraph = await collectCallGraph(ENTRY_FILES, WORKSPACE_ROOT, {});
		const nodeIds = new Set(callGraph.nodes.map((n) => n.id));
		for (const edge of callGraph.edges) {
			expect(nodeIds.has(edge.callerId)).toBe(true);
			expect(nodeIds.has(edge.calleeId)).toBe(true);
			expect(edge.location.line).toBeGreaterThan(0);
		}
	});

	test('respects maxIndirections option', async () => {
		const callGraph = await collectCallGraph(ENTRY_FILES, WORKSPACE_ROOT, { maxIndirections: 1 });
		expect(Array.isArray(callGraph.nodes)).toBe(true);
		expect(Array.isArray(callGraph.edges)).toBe(true);
	});

	test('respects timeout option', async () => {
		const callGraph = await collectCallGraph(ENTRY_FILES, WORKSPACE_ROOT, { timeout: 30_000 });
		expect(Array.isArray(callGraph.nodes)).toBe(true);
		expect(Array.isArray(callGraph.edges)).toBe(true);
	});
});
