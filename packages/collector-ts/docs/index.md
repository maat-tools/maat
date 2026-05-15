# `@maat-tools/collector-ts`

::: info Provides
`constants` · `imports`
:::

Collects TypeScript source facts.

## Facts Provided

| Fact | Type | Description |
|---|---|---|
| `constants` | `Constant[]` | Every string or numeric literal found in source files, with its value, kind, usage context, and location |
| `imports` | `Import[]` | Every import declaration, with the specifier normalized to a package name when crossing package boundaries |

### `Constant`

```ts
type Constant = {
	kind: 'string' | 'number';
	value: string;
	raw: string;
	context: ConstantContext; // 'import' | 'argument' | 'return' | 'condition' | 'decorator' | 'assignment'
	location: { file: string; line: number; column: number };
};
```

### `Import`

```ts
type Import = {
	file: string;
	packageName: string | null;
	specifier: string; // normalized: cross-package relative paths are rewritten to the destination package name
	location: { file: string; line: number; column: number };
};
```

## Options

```ts
type TSInput = {
	tsConfigFilePath: string | string[];
	exclude?: string[];
};
```

| Option | Default | Meaning |
|---|---|---|
| `tsConfigFilePath` | — | Path(s) to `tsconfig.json` files. Accepts a single path, an array of paths, or glob patterns |
| `exclude` | `['**/*.test.ts', '**/*.spec.ts']` | Glob patterns for files to skip. Matched against paths relative to `process.cwd()` |

## Usage

### Single project

```ts
export default defineConfig({
	collectors: [
		['@maat-tools/collector-ts', { tsConfigFilePath: './tsconfig.json' }],
	],
});
```

### Monorepo — glob discovery

For a monorepo, pass glob patterns. The collector expands them relative to `process.cwd()` (the config file's directory) and deduplicates files that appear in multiple tsconfigs.

```ts
export default defineConfig({
	collectors: [
		[
			'@maat-tools/collector-ts',
			{
				tsConfigFilePath: [
					'packages/*/tsconfig.json',
					'apps/*/tsconfig.json',
				],
				exclude: [
					'**/*.test.ts',
					'**/*.spec.ts',
					'**/*.tsx',          // skip client-side React files
					'**/client/**',
				],
			},
		],
	],
});
```

### Monorepo — explicit list

```ts
tsConfigFilePath: [
	'packages/core/tsconfig.json',
	'packages/api/tsconfig.json',
	'apps/server/tsconfig.json',
],
```

## Notes

- **TypeScript only.** This collector is designed for `.ts` and `.tsx` files. It relies on TypeScript type annotations and AST constructs (e.g. `private`/`protected` modifiers, explicit return types) to detect coupling signals. It should not be used for plain `.js` files.
- All file paths in emitted facts are relative to `process.cwd()`, which the CLI sets to the config file's directory before collectors run.
- Cross-package relative imports (e.g. `../../pkg-b/src/index`) are rewritten to the destination package name (e.g. `@scope/pkg-b`) so coupling rules see package-level boundaries, not filesystem paths.
- Files included in multiple tsconfigs are processed once. Deduplication is by absolute file path.
- The collector uses [ts-morph](https://ts-morph.com/) under the hood. It does not type-check — it only parses the AST. Cold-start time scales with the number of source files loaded.
- Dynamically generated functions or those in non-standard patterns may not be extracted.
- Custom type aliases that resolve to `boolean` may not always be resolved to their base type.
