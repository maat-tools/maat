# `@maat-tools/insights`

::: info Needs
Findings from at least one rule family. Each insight declares which rule families it reads via `needRules`.
:::

Built-in insights for maat. Insights are read-only analyses that run over the findings already produced by rules — they add cross-cutting signal that no single rule can surface on its own.

During `maat check`, insights receive all current findings from that run, including current findings hidden from normal output because they are baselined or covered by an active axiom. Baselined findings do not affect enforcement, but they can still matter for architectural analysis. Resolved findings that are no longer present in the current scan are not included.

## Insights

| Insight | Purpose |
|---|---|
| [`erosion`](./erosion.md) | Identify hot architectural debt: high-churn boundaries with boundary violations |

## Usage

```ts
export default defineConfig({
	collectors: [ /* ... */ ],
	rules: [ /* ... */ ],
	insights: ['@maat-tools/insights'],
});
```

You can also import a single insight directly:

```ts
import erosion from '@maat-tools/insights/erosion';

export default defineConfig({
	collectors: [ /* ... */ ],
	rules: [ /* ... */ ],
	insights: [erosion()],
});
```
