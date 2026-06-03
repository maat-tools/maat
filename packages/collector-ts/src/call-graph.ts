import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { CallEdge, CallGraph, CallNode } from '@maat-tools/vocabulary';
import { execa } from 'execa';
import { toProjectRelativePath } from './dependencies';

export async function collectCallGraph(
	entryFiles: string[],
	projectRoot: string,
	options: { maxIndirections?: number; timeout?: number },
): Promise<CallGraph> {
	const tmpFile = resolve(tmpdir(), `maat-cg-${Date.now()}.json`);

	const jellyArgs = ['--ignore-dependencies', '-j', tmpFile, '--no-print-progress', ...entryFiles];

	if (options.maxIndirections !== undefined) {
		jellyArgs.push('--max-indirections', String(options.maxIndirections));
	}

	if (options.timeout !== undefined) {
		jellyArgs.push('--timeout', String(options.timeout));
	}

	const jellyBinary = resolveJellyBinary();

	try {
		await execa(jellyBinary, jellyArgs, {
			cwd: projectRoot,
			stdio: 'pipe',
		});

		const raw = JSON.parse(await readFile(tmpFile, 'utf-8'));
		await unlink(tmpFile);

		return mapJellyToMaat(raw, projectRoot);
	} catch (error) {
		try {
			await unlink(tmpFile);
		} catch {
			// Ignore cleanup errors
		}

		throw error;
	}
}

type JellyRange = {
	fileIndex: number;
	startLine: number;
	startCol: number;
	endLine: number;
	endCol: number;
};

function parseJellyRange(loc: string): JellyRange | null {
	const parts = loc.split(':');
	if (parts.length < 5) {
		return null;
	}

	const [fileIndexStr, startLineStr, startColStr, endLineStr, endColStr] = parts;

	if (startLineStr === '?' || startColStr === '?') {
		return null;
	}

	return {
		fileIndex: Number(fileIndexStr),
		startLine: Number(startLineStr),
		startCol: Number(startColStr),
		endLine: endLineStr === '?' ? Number(startLineStr) : Number(endLineStr),
		endCol: endColStr === '?' ? Number(startColStr) : Number(endColStr),
	};
}

function findEnclosingFunctionId(
	callRange: JellyRange,
	functionData: Map<number, { id: string; range: JellyRange }>,
): string | null {
	let bestId: string | null = null;
	let bestSize = Infinity;

	for (const { id, range } of functionData.values()) {
		if (range.fileIndex !== callRange.fileIndex) {
			continue;
		}
		if (callRange.startLine < range.startLine || callRange.startLine > range.endLine) {
			continue;
		}
		if (callRange.startLine === range.startLine && callRange.startCol < range.startCol) {
			continue;
		}
		if (callRange.startLine === range.endLine && callRange.startCol > range.endCol) {
			continue;
		}

		const size = (range.endLine - range.startLine) * 100_000 + (range.endCol - range.startCol);
		if (size < bestSize) {
			bestSize = size;
			bestId = id;
		}
	}

	return bestId;
}

function resolveJellyBinary(): string {
	return require.resolve('@cs-au-dk/jelly/lib/main.js');
}

function mapJellyToMaat(
	jellyCg: {
		files: string[];
		functions: Record<number, string>;
		calls: Record<number, string>;
		call2fun: Array<[number, number]>;
	},
	projectRoot: string,
): CallGraph {
	const nodes: CallNode[] = [];
	const edges: CallEdge[] = [];
	const files = jellyCg.files.map((f) => toProjectRelativePath(projectRoot, f));

	const functionData = new Map<number, { id: string; range: JellyRange }>();

	for (const [indexStr, locStr] of Object.entries(jellyCg.functions)) {
		const index = Number(indexStr);
		const range = parseJellyRange(locStr);
		if (!range) {
			continue;
		}

		const isModuleLevel = range.startLine === 1 && range.startCol === 1;
		if (isModuleLevel) {
			continue;
		}

		const file = files[range.fileIndex];
		if (!file) {
			continue;
		}

		const line = range.startLine;
		const column = range.startCol - 1;
		const id = `${file}:${line}:${column}`;
		functionData.set(index, { id, range });

		nodes.push({
			id,
			file,
			name: `function_${index}`,
			kind: 'function',
			location: { file, line, column },
		});
	}

	for (const [callSiteIdx, calleeFunctionIdx] of jellyCg.call2fun ?? []) {
		const calleeId = functionData.get(calleeFunctionIdx)?.id;
		if (!calleeId) {
			continue;
		}

		const callLocStr = jellyCg.calls[callSiteIdx];
		if (!callLocStr) {
			continue;
		}

		const callRange = parseJellyRange(callLocStr);
		if (!callRange) {
			continue;
		}

		const callFile = files[callRange.fileIndex];
		if (!callFile) {
			continue;
		}

		const callerId = findEnclosingFunctionId(callRange, functionData);
		if (!callerId) {
			continue;
		}

		edges.push({
			callerId,
			calleeId,
			location: {
				file: callFile,
				line: callRange.startLine,
				column: callRange.startCol - 1,
			},
		});
	}

	return { nodes, edges };
}
