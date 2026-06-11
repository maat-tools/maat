# `@maat-tools/collector-ts`

::: info Provides
`constants` · `dependsOn` · `functionSignatures` · `positionalSources` · `positionalAccesses` · `algorithmicBindings` · `callGraph`
:::

Collects structural and semantic facts from TypeScript source files.

## Facts Provided

| Fact | Type | Description |
|---|---|---|
| `constants` | `Constant[]` | Every string or numeric literal found in source files, with its value, kind, and location |
| `dependsOn` | `DependsOn[]` | Every import declaration, with relative specifiers resolved to project-relative file paths |
| `functionSignatures` | `FunctionSignature[]` | Every top-level function and class method, with its parameter list and export status |
| `positionalSources` | `PositionalSource[]` | Functions and variables that return or hold positional data (tuples or fixed-shape arrays) |
| `positionalAccesses` | `PositionalAccess[]` | Index-based (`arr[0]`) and destructuring accesses to positional data |
| `algorithmicBindings` | `AlgorithmicBinding[]` | Call sites matched against user-defined algorithmic patterns (e.g. encode/decode pairs) |
| `callGraph` | `CallGraph` | Caller–callee graph across all included files |

### `Constant`

```ts
type Constant = {
  file: string;
  kind: 'string' | 'number';
  value: string;
  location: { file: string; line: number; column?: number };
};
```

### `DependsOn`

```ts
type DependsOn = {
  from: {
    path: string;
    package?: { name: string; rootPath: string };
    location: { file: string; line: number; column?: number };
  };
  to: {
    path: string;
    isExternal: boolean;
    package?: { name: string; rootPath?: string };
  };
};
```

For relative imports (e.g. `../../pkg-b/src/index`), `to.path` holds the resolved project-relative file path (e.g. `packages/pkg-b/src/index`) and `to.isExternal` is `false`. For external specifiers (package names and Node built-ins), `to.path` keeps the specifier as written and `to.package.name` holds it as well. `from.package` carries the name and root path of the nearest `package.json` above the importing file, which lets rules map package names back to filesystem boundaries.

### `FunctionSignature`

```ts
type FunctionSignature = {
  file: string;
  name: string;
  input: {
    parameters: { name: string; type: string; position: number }[];
    heterogeneous: boolean; // true when parameters have more than one distinct type
  };
  output: {
    returnType: string;
    heterogeneous: boolean; // true when the return type holds more than one distinct type
    returnSites: {
      value: string; // the returned expression text, or 'void'
      location: { file: string; line: number; column?: number };
      guardSnippet?: string; // surrounding code of the return statement, up to 300 chars
    }[];
  };
  location: { file: string; line: number; column?: number };
  exported: boolean;
};
```

Covers top-level functions and class methods. `name` for class methods is `ClassName.methodName`. Private methods are included with `exported: false`.

### `PositionalSource`

```ts
type PositionalSource = {
  file: string;
  name: string;
  type: 'function' | 'variable';
  positions: { index: number; type: string }[];
  isHeterogeneous: boolean;
  location: { file: string; line: number; column?: number };
};
```

Emitted for functions whose return type is a tuple, functions that return array literals, and variables holding array or tuple values. `isHeterogeneous` is `true` when the positions hold more than one distinct type.

### `PositionalAccess`

```ts
type PositionalAccess = {
  file: string;
  name: string;
  type: 'function' | 'variable';
  accessedIndex: number | string;
  accessKind: 'index' | 'destructuring';
  origin?: { file: string; name: string };
  location: { file: string; line: number; column?: number };
};
```

Emitted for element access expressions (`arr[0]`) and array destructuring patterns (`const [a, b] = ...`). `origin` traces the accessed value back to its declaration file and name when the symbol can be resolved.

### `AlgorithmicBinding`

```ts
type AlgorithmicBinding = {
  patternId: string;
  role: string;
  bindingKey: string;
  functionName: string;
  file: string;
  location: { file: string; line: number; column?: number };
  containingFunction: string | null;
};
```

Emitted when a call site matches one of the matchers in `algorithmicPatterns`. `patternId` identifies which pattern matched. `role` is the role within the pattern (e.g. `'sender'` or `'receiver'`). `bindingKey` is the shared literal argument that ties multiple roles together.

### `CallGraph`

```ts
type CallGraph = {
  nodes: {
    id: string; // '<file>:<line>:<column>'
    file: string;
    name: string; // synthetic (e.g. 'function_12') — Jelly does not report source names
    kind: 'function' | 'method' | 'class' | 'module'; // only 'function' is produced today
    location: { file: string; line: number; column?: number };
  }[];
  edges: {
    callerId: string;
    calleeId: string;
    location: { file: string; line: number; column?: number };
  }[];
};
```

Built using [Jelly](https://github.com/cs-au-dk/jelly) for whole-program points-to analysis. `nodes` are callable units identified by position; `edges` are directed caller-to-callee relationships. The `kind` union is reserved for future refinement — the mapper currently emits every node as `kind: 'function'` with a synthetic name. Jelly ships as a regular dependency of this package — installing `@maat-tools/collector-ts` is all that is needed; there is no separate install step. See [Call graph runtime](#call-graph-runtime) for runtime requirements.

## Options

```ts
type TSInput = {
  tsConfigFilePath: string | string[];
  exclude?: string[];
  algorithmicPatterns?: AlgorithmicPattern[];
  callGraph?: {
    maxIndirections?: number;
    timeout?: number;
  };
};
```

| Option | Default | Meaning |
|---|---|---|
| `tsConfigFilePath` | — | Path(s) to `tsconfig.json`. Accepts a single path, an array, or glob patterns |
| `exclude` | `[]` (no exclusions) | Glob patterns for files to skip, matched against paths relative to `process.cwd()` |
| `algorithmicPatterns` | `[]` | Pattern definitions for the `algorithmicBindings` fact. See [`@maat-tools/presets-ts`](/plugins/presets-ts/) for ready-made patterns |
| `callGraph.maxIndirections` | — | Maximum number of call indirections Jelly follows during analysis |
| `callGraph.timeout` | — | Time limit in seconds for Jelly's analysis pass. When the limit is hit, Jelly stops and emits the graph computed so far, so `callGraph` may be incomplete |

## Call graph runtime

The `callGraph` fact is produced by [Jelly](https://github.com/cs-au-dk/jelly), which runs as a subprocess. The subprocess is spawned with the same runtime that is executing Maat, so no extra tooling needs to be on `PATH`:

- **Node.js** (`npx maat`, npm/pnpm installs): Jelly requires **Node.js 22 or newer** and exits with an error on older versions. This package declares `engines.node >= 22` so package managers warn at install time.
- **Bun** (`bunx maat`, bun-only machines): Jelly runs on Bun directly. Machines without Node.js installed work.
- **Yarn Plug'n'Play** is not supported: Jelly cannot be executed from inside a zip archive. Set `nodeLinker: node-modules` in `.yarnrc.yml`.

The `callGraph` fact is the same regardless of which runtime executes Jelly. Raw Jelly output can differ in unresolved call sites for runtime-specific builtins (e.g. `bun:test` imports), but those entries carry no edges and are discarded during mapping.

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
          '**/*.tsx',
          '**/client/**',
        ],
      },
    ],
  ],
});
```

### With algorithmic patterns

```ts
import { tsAlgorithmicPatterns } from '@maat-tools/presets-ts';

export default defineConfig({
  collectors: [
    [
      '@maat-tools/collector-ts',
      {
        tsConfigFilePath: './tsconfig.json',
        algorithmicPatterns: tsAlgorithmicPatterns,
      },
    ],
  ],
});
```

## Notes

- **TypeScript only.** This collector targets `.ts` and `.tsx` files. It relies on TypeScript AST constructs and should not be used for plain `.js` files.
- All file paths in emitted facts are relative to `process.cwd()`, which the CLI sets to the config file's directory before collectors run.
- Files included in multiple tsconfigs are processed once. Deduplication is by absolute file path.
- The collector uses [ts-morph](https://ts-morph.com/) for AST parsing. It does not run full project diagnostics, but it does query the TypeScript type checker in places (return types of function signatures, element types of positional sources). Cold-start time scales with the number of source files loaded.
- The call graph is built by Jelly separately from the ts-morph pass. If the Jelly subprocess fails (for example, the runtime is older than Node.js 22), the run fails with Jelly's error output — `callGraph` is never silently empty. A `callGraph.timeout` hit is not a failure: the partial graph is returned.
