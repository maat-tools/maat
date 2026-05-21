import { describe, expect, test } from 'bun:test';
import {
	bufferEncodingPattern,
	dateFormatPattern,
	fileEncodingPattern,
	hashAlgorithmPattern,
	packUnpackPattern,
	tsAlgorithmicPatterns,
} from './index';

describe('presets-ts', () => {
	test('tsAlgorithmicPatterns contains all presets', () => {
		expect(tsAlgorithmicPatterns).toHaveLength(5);
		expect(tsAlgorithmicPatterns.map((p) => p.id)).toEqual([
			'pack-unpack',
			'file-encoding',
			'hash-algo',
			'buffer-encoding',
			'date-format',
		]);
	});

	test('packUnpackPattern has packer and unpacker roles', () => {
		expect(packUnpackPattern.roles).toEqual(['packer', 'unpacker']);
		expect(packUnpackPattern.matchers).toHaveLength(3);
		expect(packUnpackPattern.matchers[0]?.role).toBe('packer');
		expect(packUnpackPattern.matchers[1]?.role).toBe('packer');
		expect(packUnpackPattern.matchers[1]?.expressionKind).toBe('template');
		expect(packUnpackPattern.matchers[2]?.role).toBe('unpacker');
	});

	test('fileEncodingPattern has reader and writer roles with correct arg indexes', () => {
		expect(fileEncodingPattern.roles).toEqual(['reader', 'writer']);
		expect(fileEncodingPattern.matchers[0]?.literalArgIndex).toBe(1);
		expect(fileEncodingPattern.matchers[1]?.literalArgIndex).toBe(2);
	});

	test('hashAlgorithmPattern has single role hasher', () => {
		expect(hashAlgorithmPattern.roles).toEqual(['hasher']);
		expect(hashAlgorithmPattern.matchers).toHaveLength(1);
		expect(hashAlgorithmPattern.matchers[0]?.literalArgIndex).toBe(0);
	});

	test('bufferEncodingPattern has encoder and decoder roles', () => {
		expect(bufferEncodingPattern.roles).toEqual(['encoder', 'decoder']);
	});

	test('dateFormatPattern has formatter and parser roles', () => {
		expect(dateFormatPattern.roles).toEqual(['formatter', 'parser']);
	});
});
