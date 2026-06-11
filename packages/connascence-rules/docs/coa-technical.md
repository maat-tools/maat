# `coa-technical`

::: info Needs
`algorithmicBindings` — from [`@maat-tools/collector-ts`](/plugins/collector-ts/) when `algorithmicPatterns` are configured
:::

`coa-technical` detects **Connascence of Algorithm (Technical)**: pairs (or groups) of operations that are algorithmic complements — encode/decode, pack/unpack, read/write — sharing the same invariant literal without a shared abstraction.

Unlike Connascence of Meaning (`com`), which flags any repeated literal, this rule only fires when the literal appears in **complementary roles** that the user has explicitly configured (e.g. a delimiter used in both `.join` and `.split`).

## What It Checks

The rule groups `algorithmicBindings` by `patternId` + `bindingKey`. A finding is produced when **both** conditions are met:

1. The same `bindingKey` appears in at least **`minFiles`** distinct files (default: **2**).
2. The usages span at least **two distinct roles** from the pattern (e.g. `packer` + `unpacker`).

Condition 2 can be disabled by setting `requireCompletePair: false`.

::: details What this rule detects

A delimiter shared between `.join` and `.split` without a named constant, creating a silent coupling across the codebase.

```ts
// cache.ts
export function buildKey(userId: string, scope: string): string {
	return [userId, scope].join(':');
}

// session.ts
export function parseKey(key: string): [string, string] {
	return key.split(':') as [string, string];
}
```

Finding:

```txt
Pattern "pack-unpack" shares invariant ":" across 2 file(s) without a shared abstraction — possible Connascence of Algorithm
```

With the default `minFiles: 2`, the complementary usages must live in two distinct files. Set `minFiles: 1` to also flag pairs inside a single file.

:::

## Options

```ts
type CoATechnicalOptions = {
	patterns?: string[];
	minFiles?: number;
	requireCompletePair?: boolean;
	requireSameContainer?: boolean;
	ignoreBindingKeys?: string[];
};
```

| Option | Default | Meaning |
|---|---|---:|
| `patterns` | `undefined` (all) | Only observe these pattern IDs |
| `minFiles` | `2` | Minimum distinct files that must contain the same invariant |
| `requireCompletePair` | `true` | Only report when the invariant is used by at least two different roles from the same pattern |
| `requireSameContainer` | `false` | Only report when complementary roles share the same containing function or module-level file |
| `ignoreBindingKeys` | `[]` | Additional invariants to ignore beyond the built-in universal noise set (`,`, `/`, `\\`) |

## Configuration

```ts
import coaTechnical from '@maat-tools/connascence-rules/coa-technical';

export default defineConfig({
	rules: [
		coaTechnical({
			patterns: ['pack-unpack'],
			requireSameContainer: true,
		}),
	],
});
```

Or using presets instead of hand-writing `algorithmicPatterns`:

```ts
import { tsAlgorithmicPatterns } from '@maat-tools/presets-ts';

export default defineConfig({
	collectors: [
		['@maat-tools/collector-ts', {
			tsConfigFilePath: './tsconfig.json',
			algorithmicPatterns: tsAlgorithmicPatterns,
		}],
	],
	rules: [
		coaTechnical(),
	],
});
```

## Limitations

- **Only detects what you configure.** If a pattern is not in `algorithmicPatterns`, it is invisible to the rule.
- **AST-only.** Cannot detect semantic pairs without shared literals (e.g. two different regexes that validate the same thing).
- **No data-flow analysis.** The rule assumes that if `JSON.stringify` and `JSON.parse` appear in the same codebase, they may form a pair. It cannot prove they process the same data. This is the single biggest source of false positives.
- **Universal separators produce noise.** Characters like `,`, `/`, and `\\` are built into the noise set because they appear in virtually every codebase. You can add more via `ignoreBindingKeys`.
- **Heuristic container tracking.** `containingFunction` is inferred syntactically from the AST parent chain. It captures function, method and arrow-function names, but falls back to module-level when a binding is at the top level of a file.

::: info Planned
A companion rule **`coa-semantic`** is planned to detect algorithmic complements using LLM-based semantic analysis, eliminating the false positives caused by coincidental literal reuse across unrelated data flows.
:::

## Finding Identity

Findings are identified by pattern and invariant:

```ts
ruleIdentifier: { patternId, bindingKey }
```

This keeps findings stable when additional call sites are added or removed, as long as the shared invariant remains.
