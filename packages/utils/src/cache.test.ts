import { afterEach, describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { LocalCache } from './cache';

// LocalCache writes under `${cwd}/.maat/cache/${cachePath}`. Each test uses a unique
// namespace so runs never collide, and afterEach removes it from the working tree.
const namespaces: string[] = [];
function nextNs(): string {
	const ns = `cache-test-${Math.floor(Math.random() * 1_000_000_000)}`;
	namespaces.push(ns);
	return ns;
}
afterEach(() => {
	for (const ns of namespaces.splice(0)) {
		rmSync(join(process.cwd(), '.maat', 'cache', ns), { recursive: true, force: true });
	}
});

describe('LocalCache', () => {
	test('throws when constructed without a cache path', () => {
		expect(() => new LocalCache({ cachePath: '' })).toThrow('Cache path must be provided');
	});

	test('writes and reads back a JSON entry', async () => {
		const cache = new LocalCache({ cachePath: nextNs() });
		await cache.writeCacheEntry('dir', 'a.json', { score: 1 });
		expect(await cache.readCacheEntry<{ score: number }>('dir/a.json')).toEqual({ score: 1 });
	});

	test('returns null when reading a missing entry', async () => {
		const cache = new LocalCache({ cachePath: nextNs() });
		expect(await cache.readCacheEntry('nope.json')).toBeNull();
	});

	test('lists the files in a directory', async () => {
		const cache = new LocalCache({ cachePath: nextNs() });
		await cache.writeCacheEntry('d', 'a.json', 1);
		await cache.writeCacheEntry('d', 'b.json', 2);
		expect((await cache.getFileList('d')).sort()).toEqual(['a.json', 'b.json']);
	});

	test('returns an empty array for a missing directory', async () => {
		const cache = new LocalCache({ cachePath: nextNs() });
		expect(await cache.getFileList('missing')).toEqual([]);
	});

	test('deleteEntry removes an existing file', async () => {
		const cache = new LocalCache({ cachePath: nextNs() });
		await cache.writeCacheEntry('d', 'a.json', 1);
		await cache.deleteEntry('d/a.json');
		expect(await cache.readCacheEntry('d/a.json')).toBeNull();
	});

	test('deleteEntry succeeds silently when the file does not exist', async () => {
		const cache = new LocalCache({ cachePath: nextNs() });
		await expect(cache.deleteEntry('missing.json')).resolves.toBeUndefined();
	});
});
