import { access, appendFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function* ancestorDirs(startDir: string): Generator<string> {
	let current = startDir;

	while (true) {
		yield current;
		const parent = dirname(current);
		if (parent === current) {
			break;
		}
		current = parent;
	}
}

export async function pathExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);

		return true;
	} catch {
		return false;
	}
}

export async function findMaatConfig(cwd: string, validConfigFilenames: string[]): Promise<string | undefined> {
	for (const dir of ancestorDirs(resolve(cwd))) {
		for (const filename of validConfigFilenames) {
			const candidate = join(dir, filename);
			if (await pathExists(candidate)) {
				return candidate;
			}
		}
	}
}

export function getCurrentDir(): string {
	return resolve(process.cwd());
}

export function resolveSymbol(symbol: string): string {
	return resolve(symbol);
}

export function getFilepathFromCurrentDir(relativePath: string): string {
	return resolve(getCurrentDir(), relativePath);
}

export async function resolvePath(path: string, cwd: string): Promise<string> {
	const resolved = isAbsolute(path) ? path : resolve(cwd, path);

	if (!(await pathExists(resolved))) {
		throw new Error(`File not found: ${resolved}`);
	}

	return resolved;
}

export function getDirname(path: string): string {
	return dirname(path);
}

const TS_EXTENSIONS = new Set(['.ts', '.mts', '.cts']);

export async function importFileDynamically<T>({
	filePath,
	asDefault,
}: {
	filePath: string;
	asDefault: boolean;
}): Promise<T> {
	const isTsFile = TS_EXTENSIONS.has(filePath.slice(filePath.lastIndexOf('.')));
	const isRunningUnderBun = typeof (process.versions as Record<string, string | undefined>).bun !== 'undefined';

	if (isTsFile && !isRunningUnderBun) {
		const { createJiti } = await import('jiti');
		const jiti = createJiti(import.meta.url);

		if (asDefault) {
			const defaultExport = await jiti.import(filePath, { default: true });

			return { default: defaultExport } as T;
		}

		return jiti.import(filePath) as Promise<T>;
	}

	return import(pathToFileURL(filePath).href) as Promise<T>;
}

export function getFileURL(path: string): string {
	return pathToFileURL(path).href;
}

export function resolveModule(path: string, moduleName: string) {
	return createRequire(path).resolve(moduleName);
}

export function requireFile(path: string, from: string) {
	return createRequire(from)(path);
}

export async function readFileContent(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
	return readFile(path, { encoding });
}

export async function appendToFile(path: string, content: string, encoding: BufferEncoding = 'utf-8'): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	return appendFile(path, content, { encoding });
}
