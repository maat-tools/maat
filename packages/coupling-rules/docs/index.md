# `@maat-tools/coupling-rules`

::: info Needs
`imports` — from [`@maat-tools/collector-ts`](/plugins/collector-ts/) or any collector that provides imports
:::

Rules for enforcing import boundaries between packages and architectural layers.

## Rules

| Rule | Purpose |
|---|---|
| [`layer(target)`](./layer.md) | Enforce which imports a package or path-based layer may use |

## Usage

```ts
import { layer, Pure } from '@maat-tools/coupling-rules';

export default defineConfig({
	rules: [
		layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts').build(),
		layer('./src/domain/**').allows('./src/shared/**', 'react').build(),
	],
});
```

Use package targets when your boundaries map to package names. Use path targets when your project is a single package with internal architectural layers.
