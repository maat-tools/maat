import { inspect } from 'node:util';

/**
 * Print any object to console with full depth, no truncation.
 * Handles circular references safely.
 *
 * Usage:
 *   import { dump } from '@maat-tools/core';
 *   dump(someObject);
 *   dump(someObject, { depth: 2 });
 */
export function dump(data: unknown, options?: { depth?: number }): void {
	console.log(
		inspect(data, {
			depth: options?.depth ?? null,
			colors: true,
			maxArrayLength: null,
			maxStringLength: null,
			breakLength: 80,
			compact: false,
		}),
	);
}
