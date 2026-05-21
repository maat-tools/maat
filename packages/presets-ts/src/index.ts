import type { AlgorithmicPattern } from '@maat-tools/vocabulary';

/**
 * Pack / unpack using a delimiter.
 * Detects `.join(delim)` and `.split(delim)` where the delimiter literal
 * is shared but not extracted to a constant.
 */
export const packUnpackPattern: AlgorithmicPattern = {
	id: 'pack-unpack',
	roles: ['packer', 'unpacker'],
	matchers: [
		{ role: 'packer', functionPattern: '\\.join$', literalArgIndex: 0 },
		{ role: 'packer', functionPattern: '^template-literal$', expressionKind: 'template' },
		{ role: 'unpacker', functionPattern: '\\.split$', literalArgIndex: 0 },
	],
};

/**
 * File read / write with the same encoding literal.
 * Detects `readFile(path, 'utf-8')` and `writeFile(path, data, 'utf-8')`
 * where the encoding is repeated but not shared.
 */
export const fileEncodingPattern: AlgorithmicPattern = {
	id: 'file-encoding',
	roles: ['reader', 'writer'],
	matchers: [
		{ role: 'reader', functionPattern: '^readFile(Sync)?$', literalArgIndex: 1 },
		{ role: 'writer', functionPattern: '^writeFile(Sync)?$', literalArgIndex: 2 },
	],
};

/**
 * Hash algorithm repeated across multiple call sites.
 * Detects `createHash('sha256')` appearing in more than one place.
 */
export const hashAlgorithmPattern: AlgorithmicPattern = {
	id: 'hash-algo',
	roles: ['hasher'],
	matchers: [{ role: 'hasher', functionPattern: '^createHash$', literalArgIndex: 0 }],
};

/**
 * Buffer / Base64 encoding pair.
 * Detects `Buffer.from(str, 'base64')` and `buf.toString('base64')`
 * where the encoding literal is not shared.
 */
export const bufferEncodingPattern: AlgorithmicPattern = {
	id: 'buffer-encoding',
	roles: ['encoder', 'decoder'],
	matchers: [
		{ role: 'encoder', functionPattern: '^Buffer\\.from$', literalArgIndex: 1 },
		{ role: 'decoder', functionPattern: '\\.toString$', literalArgIndex: 0 },
	],
};

/**
 * Date serialization / deserialization.
 * Detects `date.toISOString()` and `new Date(str)` pairs
 * where the format assumption is implicit.
 */
export const dateFormatPattern: AlgorithmicPattern = {
	id: 'date-format',
	roles: ['formatter', 'parser'],
	matchers: [
		{ role: 'formatter', functionPattern: '\\.toISOString$' },
		{ role: 'parser', functionPattern: '^Date$', literalArgIndex: 0 },
	],
};

/**
 * All built-in TypeScript / JavaScript algorithmic patterns.
 * Import this array and spread it into your collector configuration.
 *
 * @example
 * ```ts
 * import { tsAlgorithmicPatterns } from '@maat-tools/presets-ts';
 *
 * export default defineConfig({
 *   collectors: [
 *     ['@maat-tools/collector-ts', {
 *       tsConfigFilePath: './tsconfig.json',
 *       algorithmicPatterns: tsAlgorithmicPatterns,
 *     }],
 *   ],
 * });
 * ```
 */
export const tsAlgorithmicPatterns: AlgorithmicPattern[] = [
	packUnpackPattern,
	fileEncodingPattern,
	hashAlgorithmPattern,
	bufferEncodingPattern,
	dateFormatPattern,
];
