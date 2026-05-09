# `@maat-tools/git-rules`

::: info Needs
`git_commits` · `git_file_changes` — from [`@maat-tools/collector-git`](../collector-git/)
:::

Rules derived from git history. Requires [`@maat-tools/collector-git`](../collector-git/) to be configured as a collector.

## Rules

| Rule | Purpose |
|---|---|
| [`churn`](./churn.md) | Detect files that change too frequently within a time window |

## Usage

```ts
import gitRules from '@maat-tools/git-rules';

export default defineConfig({
	collectors: [
		['@maat-tools/collector-git', {}],
	],
	rules: [gitRules],
});
```

You can also import one rule directly:

```ts
import churn from '@maat-tools/git-rules/churn';

export default defineConfig({
	collectors: [
		['@maat-tools/collector-git', { since: '90 days ago' }],
	],
	rules: [
		churn({
			threshold: 10,
			windowDays: 90,
		}),
	],
});
```
