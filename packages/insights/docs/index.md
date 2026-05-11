# `@maat-tools/insights`

::: info Needs
Findings from at least one rule family. Each insight declares which rule families it reads via `needRules`.
:::

Built-in insights for maat. Insights are read-only analyses that run over the findings already produced by rules — they add cross-cutting signal that no single rule can surface on its own.

## Insights

| Insight | Purpose |
|---|---|
| [`erosion`](./erosion.md) | Identify hot architectural debt: high-churn packages with boundary violations |

## Usage

```ts
import insights from '@maat-tools/insights';

export default defineConfig({
	collectors: [ /* ... */ ],
	rules: [ /* ... */ ],
	insights: [insights],
});
```

You can also import a single insight directly:

```ts
import decayIntersection from '@maat-tools/insights/erosion';

export default defineConfig({
	collectors: [ /* ... */ ],
	rules: [ /* ... */ ],
	insights: [
		['@maat-tools/insights/erosion', { packageDir: 'packages/', packagePrefix: '@acme/' }],
	],
});
```
