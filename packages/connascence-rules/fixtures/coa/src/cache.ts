// Pack/unpack: uses ':' as delimiter in multiple places without a shared constant

export function buildCacheKey(userId: string, scope: string): string {
	return `${userId}:${scope}`;
}

export function parseCacheKey(key: string): [string, string] {
	return key.split(':') as [string, string];
}
