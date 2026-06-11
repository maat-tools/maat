# `erosion`

::: info Needs
Findings from `maat-tools/git-rules/churn@v1` — from [`@maat-tools/git-rules`](../git-rules/) — and any `maat-tools/coupling-rules/pure-imports@v1` or `maat-tools/coupling-rules/layer-imports@v1` rule instance — from [`@maat-tools/coupling-rules`](../coupling-rules/).
:::

`erosion` identifies hot architectural debt: boundaries that are simultaneously high-churn and violating layer constraints. Neither signal alone tells the full story: churning code might be healthy, and a violation might be dormant. The combination — volatile code that is also architecturally out of bounds — is where active decay concentrates.

## What It Checks

For each run the insight:

1. Collects high-churn files from `maat-tools/git-rules/churn@v1` findings.
2. Collects boundaries named in coupling violation rule instance IDs, such as `@acme/payments` or `src/payments/**`.
3. Matches churn files to those boundaries.
4. Ranks matching boundaries by total churn descending.
5. Reports the hottest file and an example leaking import so the output points at the active pressure, not only the boundary name.

If no boundary has both churn and coupling violations, the insight produces no output.

## Options

```ts
type ErosionOptions = Record<string, never>;
```

`erosion` has no options.

The boundary is taken from the coupling rule's instance ID, which has the form `<ruleId>:<target>` (e.g. `maat-tools/coupling-rules/layer-imports@v1:src/payments/**`). Targets never start with `./` — `layer()` rejects relative-path targets.

Path-mode boundaries are matched directly — churn file paths are tested against the target glob:

```
maat-tools/coupling-rules/layer-imports@v1:src/payments/**
└─ matches churn in src/payments/**
```

Name-mode boundaries are resolved through the violating import's package facts: when the violation's `from.package.name` equals the boundary, the match glob becomes `<from.package.rootPath>/**`:

```
maat-tools/coupling-rules/layer-imports@v1:@acme/payments
└─ violating import comes from package @acme/payments rooted at packages/payments
   └─ matches churn in packages/payments/**
```

If no violation carries package facts for the boundary, the package name itself is used as the glob — which matches no file paths, so the boundary reports no churn.

## Configuration

```ts
import { layer } from '@maat-tools/coupling-rules';

export default defineConfig({
	collectors: [
		['@maat-tools/collector-git', { sinceDays: 90 }],
		['@maat-tools/collector-ts', { tsConfigFilePath: './tsconfig.json' }],
	],
	rules: [
		['@maat-tools/git-rules/churn', { threshold: 5, windowDays: 90 }],
		layer('@acme/payments').allows('@acme/core-typings').build(),
		layer('src/billing/**').allows('src/shared/**').build(),
	],
	insights: ['@maat-tools/insights/erosion'],
});
```

If `@acme/payments` has 3 churning files totalling 27 changes and also imports something outside its allowed set, the insight reports:

```txt
INSIGHTS (1)
────────────
  [maat-tools/erosion@v1] hot architectural debt in 1 boundary(s): @acme/payments (27 changes across 3 hot files, 1 boundary violation; hottest packages/payments/src/processor.ts (12 changes); leaking @acme/legacy-db)
```

## When It Does Not Fire

- There are no churn findings (no rule at threshold, no git collector).
- There are no coupling violation findings (no layer rules configured, or all constraints are satisfied).
- Churning boundaries and violating boundaries are disjoint — different parts of the codebase are churning vs. breaking rules.

The last case is the most common on a first run. It often means your most volatile code happens to be clean, or your violated constraints are in stable, rarely-touched boundaries. Adding layer rules for the boundaries that appear in your churn list is the fastest way to bring the insight to life.

## Relationship to Individual Rules

The churn rule surfaces individual files. The coupling rules surface individual import violations. `erosion` asks a different question: *which boundaries* are under pressure from both sides at once, and where should a reviewer look first? It is a triage tool, not a replacement for the underlying rules.
