# `erosion`

::: info Needs
Findings from `git/churn@v1` — from [`@maat-tools/git-rules`](../git-rules/) — and any `coupling/pure-imports:*` or `coupling/layer-imports:*` rule — from [`@maat-tools/coupling-rules`](../coupling-rules/).
:::

`erosion` identifies hot architectural debt: boundaries that are simultaneously high-churn and violating layer constraints. Neither signal alone tells the full story: churning code might be healthy, and a violation might be dormant. The combination — volatile code that is also architecturally out of bounds — is where active decay concentrates.

## What It Checks

For each run the insight:

1. Collects high-churn files from `git/churn@v1`.
2. Collects boundaries named in coupling violation rule IDs, such as `@acme/payments` or `./src/payments/**`.
3. Matches churn files to those boundaries.
4. Ranks matching boundaries by total churn descending.
5. Reports the hottest file and an example leaking import so the output points at the active pressure, not only the boundary name.

If no boundary has both churn and coupling violations, the insight produces no output.

## Options

```ts
type ErosionOptions = Record<string, never>;
```

`erosion` has no options.

Path-mode layer rules are matched directly:

```
coupling/layer-imports:./src/payments/**@v1
└─ matches churn in src/payments/**
```

Name-mode layer rules match churn paths that contain the boundary's last segment, with violation files as a fallback:

```
coupling/layer-imports:@acme/payments@v1
└─ boundary segment payments
   └─ matches churn in packages/payments/** or src/payments/**
```

## Configuration

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
		layer('./src/billing/**').allows('./src/shared/**'),
	],
	insights: ['@maat-tools/insights/erosion'],
});
```

If `@acme/payments` has 3 churning files totalling 27 changes and also imports something outside its allowed set, the insight reports:

```txt
INSIGHTS (1)
────────────
  [erosion@v1] hot architectural debt in 1 boundary(s): @acme/payments (27 changes across 3 hot files, 1 boundary violation; hottest packages/payments/src/processor.ts (12 changes); leaking @acme/legacy-db)
```

## When It Does Not Fire

- There are no churn findings (no rule at threshold, no git collector).
- There are no coupling violation findings (no layer rules configured, or all constraints are satisfied).
- Churning boundaries and violating boundaries are disjoint — different parts of the codebase are churning vs. breaking rules.

The last case is the most common on a first run. It often means your most volatile code happens to be clean, or your violated constraints are in stable, rarely-touched boundaries. Adding layer rules for the boundaries that appear in your churn list is the fastest way to bring the insight to life.

## Relationship to Individual Rules

The churn rule surfaces individual files. The coupling rules surface individual import violations. `erosion` asks a different question: *which boundaries* are under pressure from both sides at once, and where should a reviewer look first? It is a triage tool, not a replacement for the underlying rules.
