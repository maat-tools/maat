# `erosion`

::: info Needs
Findings from `git/churn@v1` — from [`@maat-tools/git-rules`](../git-rules/) — and any `coupling/pure-imports:*` or `coupling/layer-imports:*` rule — from [`@maat-tools/coupling-rules`](../coupling-rules/).
:::

`erosion` identifies hot architectural debt: packages that are simultaneously high-churn and violating layer constraints. Neither signal alone tells the full story: a churning package might be healthy, and a violation might be dormant. The combination — volatile code that is also architecturally out of bounds — is where active decay concentrates.

## What It Checks

For each run the insight:

1. Groups churn findings by package, summing the change count of every churning file within the package.
2. Collects the set of packages named in coupling violation rule IDs (e.g. `coupling/layer-imports:@acme/payments@v1` → `@acme/payments`).
3. Intersects the two sets and ranks matching packages by total churn descending.
4. Reports the hottest file and an example leaking import so the output points at the active pressure, not only the package name.

If no package appears in both sets, the insight produces no output.

## Options

```ts
type ErosionOptions = {
	packageDir?: string;
	packagePrefix?: string;
};
```

| Option | Default | Meaning |
|---|---:|---|
| `packageDir` | `'packages/'` | Directory prefix used to infer the package name from a churn finding's file path. Files outside this directory are ignored. |
| `packagePrefix` | `''` | npm scope prefix prepended to the directory segment when resolving the package name. Set to `'@acme/'` if your packages are published as `@acme/X`. |

The insight maps a churn file path to a package name using both options:

```
packages/payments/src/processor.ts
└─ strip packageDir ──► payments/src/processor.ts
   └─ take first segment ──► payments
      └─ prepend packagePrefix ──► @acme/payments
```

The resolved name is then matched against the package extracted from coupling rule IDs:

```
coupling/layer-imports:@acme/payments@v1
└─ extract ──► @acme/payments
```

## Example

```ts
import erosion from '@maat-tools/insights/erosion';

export default defineConfig({
	collectors: [
		['@maat-tools/collector-git', { sinceDays: 90 }],
		['@maat-tools/collector-ts', { tsConfigFilePath: './tsconfig.json' }],
	],
	rules: [
		['@maat-tools/git-rules/churn', { threshold: 5, windowDays: 90 }],
		layer('@acme/payments').allows('@acme/core-typings'),
	],
	insights: [
		['@maat-tools/insights/erosion', { packageDir: 'packages/', packagePrefix: '@acme/' }],
	],
});
```

If `@acme/payments` has 3 churning files totalling 27 changes and also imports something outside its allowed set, the insight reports:

```txt
INSIGHTS (1)
────────────
  [erosion@v1] hot architectural debt in 1 package(s): @acme/payments (27 changes across 3 hot files, 1 boundary violation; hottest packages/payments/src/processor.ts (12 changes); leaking @acme/legacy-db)
```

## When It Does Not Fire

- There are no churn findings (no rule at threshold, no git collector).
- There are no coupling violation findings (no layer rules configured, or all constraints are satisfied).
- Churning packages and violating packages are disjoint — different parts of the codebase are churning vs. breaking rules.

The last case is the most common on a first run. It often means your most volatile code happens to be clean, or your violated constraints are in stable, rarely-touched packages. Adding layer rules for the packages that appear in your churn list is the fastest way to bring the insight to life.

## Relationship to Individual Rules

The churn rule surfaces individual files. The coupling rules surface individual import violations. `erosion` asks a different question: *which packages* are under pressure from both sides at once, and where should a reviewer look first? It is a triage tool, not a replacement for the underlying rules.
