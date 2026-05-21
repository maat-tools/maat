# `@maat-tools/presets-ts`

Pre-configured `AlgorithmicPattern` definitions for common TypeScript / JavaScript pairs.

These presets eliminate the need to hand-write regex patterns for the `algorithmicPatterns` option of `@maat-tools/collector-ts`.

## Usage

Import the full array or individual patterns:

```ts
import { tsAlgorithmicPatterns } from '@maat-tools/presets-ts';

export default defineConfig({
	collectors: [
		['@maat-tools/collector-ts', {
			tsConfigFilePath: './tsconfig.json',
			algorithmicPatterns: tsAlgorithmicPatterns,
		}],
	],
});
```

Or pick only the ones you need:

```ts
import { packUnpackPattern, hashAlgorithmPattern } from '@maat-tools/presets-ts';

algorithmicPatterns: [packUnpackPattern, hashAlgorithmPattern]
```

## Available Presets

| Preset | ID | Detects |
|---|---|---|
| `packUnpackPattern` | `pack-unpack` | `.join(delim)` + template literal `\${a}:${b}` + `.split(delim)` |
| `fileEncodingPattern` | `file-encoding` | `readFile(*, enc)` + `writeFile(*, *, enc)` |
| `hashAlgorithmPattern` | `hash-algo` | `createHash(algo)` repeated across files |
| `bufferEncodingPattern` | `buffer-encoding` | `Buffer.from(*, enc)` + `buf.toString(enc)` |
| `dateFormatPattern` | `date-format` | `date.toISOString()` + `new Date(str)` |

## Extending

You can combine presets with your own custom patterns:

```ts
import { tsAlgorithmicPatterns } from '@maat-tools/presets-ts';
import type { AlgorithmicPattern } from '@maat-tools/vocabulary';

const customPattern: AlgorithmicPattern = {
	id: 'my-protocol',
	roles: ['sender', 'receiver'],
	matchers: [
		{ role: 'sender', functionPattern: '^sendMessage$', literalArgIndex: 1 },
		{ role: 'receiver', functionPattern: '^receiveMessage$', literalArgIndex: 1 },
	],
};

algorithmicPatterns: [...tsAlgorithmicPatterns, customPattern]
```

## Adding New Presets

If you define a pattern that is useful across many TS/JS projects, consider opening a PR to add it to `@maat-tools/presets-ts`. Each preset should:

1. Have a clear, generic name (not project-specific).
2. Target a well-known API or convention in the TS/JS ecosystem.
3. Include both roles when the pair is naturally complementary (encode/decode, read/write, etc.).
