# `@maat-tools/connascence-rules`

::: info Needs
`constants` — from [`@maat-tools/collector-ts`](/plugins/collector-ts/) or any collector that provides constants
:::

Built-in rules for detecting connascence in source code.

## Rules

| Rule | Purpose |
|---|---|
| [`com`](./com.md) | Detect repeated string and numeric literals across files |

## Usage

```ts
import connascenceRules from '@maat-tools/connascence-rules';

export default defineConfig({
	rules: [connascenceRules],
});
```

You can also import one rule directly:

```ts
import com from '@maat-tools/connascence-rules/com';

export default defineConfig({
	rules: [
		com({
			threshold: 4,
			ignoreValues: ['pending'],
		}),
	],
});
```
