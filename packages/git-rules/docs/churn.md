# `churn`

::: info Needs
`gitCommits` · `gitFileChanges` — from [`@maat-tools/collector-git`](../collector-git/)
:::

`churn` reports files whose change count meets the configured threshold within a rolling time window. Frequent changes can help identify files to inspect, but the count alone does not establish excessive coupling, defects, or business cost.

## What It Checks

The rule joins git commits with their file changes, filters to the configured window, counts changes per file, and reports a finding for any file that meets or exceeds the threshold.

Deleted files are counted the same as modifications — a file deleted and recreated frequently is still a churn signal.

::: details What this rule detects

A file whose commit count meets or exceeds the configured threshold in the time window. The rule does not compare that count with the rest of the codebase.

```
# Commits touching src/payments/processor.ts in the last 90 days

a1b2c3d  fix: handle payment timeout
d4e5f6g  feat: add retry with exponential backoff
7h8i9j0  fix: race condition under concurrent load
k1l2m3n  refactor: extract validation into helper
o4p5q6r  fix: memory leak in long-running jobs
s7t8u9v  chore: align error messages with API spec
w0x1y2z  fix: currency rounding edge case
...
# 14 commits total → exceeds threshold of 10
```

Finding:

```txt
"src/payments/processor.ts" changed 14 times in the last 90 days — high churn
```

:::

## Options

```ts
type ChurnOptions = {
	threshold?: number;
	windowDays?: number;
	exclude?: string[];
};
```

| Option | Default | Meaning |
|---|---:|---|
| `threshold` | `10` | Minimum number of changes within the window before a finding is produced |
| `windowDays` | `90` | Rolling window in days |
| `exclude` | `[]` | Glob patterns for paths to skip. Matched against the project-relative file path |

## Configuration

```ts
import churn from '@maat-tools/git-rules/churn';

export default defineConfig({
	collectors: [
		['@maat-tools/collector-git', { sinceDays: 90 }],
	],
	rules: [
		churn({
			threshold: 10,
			windowDays: 90,
			exclude: [
				'**/index.ts',
				'**/*.test.ts',
				'**/*.json',
			],
		}),
	],
});
```

If `src/payments/processor.ts` changed 14 times in the last 90 days, the rule reports:

```txt
"src/payments/processor.ts" changed 14 times in the last 90 days — high churn
```

## Finding Identity

Findings are identified by file path:

```ts
ruleIdentifier: { path }
```

A finding for a given file remains stable across runs as long as the file keeps exceeding the threshold. It resolves automatically as commits age out of the window.

## Auto-Resolution

Unlike structural findings, churn findings are self-healing. Once a file stops accumulating changes, old commits slide out of the window and the finding disappears without any manual action.
