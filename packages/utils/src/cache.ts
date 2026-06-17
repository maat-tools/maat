import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export class LocalCache {
	private cachePath = join(process.cwd(), '.maat', 'cache');

	public constructor({ cachePath }: { cachePath: string }) {
		if (!cachePath) {
			throw new Error('Cache path must be provided');
		}
		this.cachePath = join(this.cachePath, cachePath);
	}

	public async readCacheEntry<T>(file: string): Promise<T | null> {
		try {
			const content = await readFile(join(this.cachePath, file), 'utf-8');

			return JSON.parse(content) as T;
		} catch {
			return null;
		}
	}

	public async writeCacheEntry<T>(dir: string, file: string, value: T): Promise<void> {
		const dirPath = join(this.cachePath, dir);
		await mkdir(dirPath, { recursive: true });
		await writeFile(join(dirPath, file), JSON.stringify(value), 'utf-8');
	}

	public async getFileList(dir: string): Promise<string[]> {
		try {
			return await readdir(join(this.cachePath, dir));
		} catch {
			return [];
		}
	}

	public async deleteEntry(file: string): Promise<void> {
		return unlink(join(this.cachePath, file));
	}
}
