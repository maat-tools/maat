# `@maat-tools/connascence-rules`

::: info Needs
`constants` — from [`@maat-tools/collector-ts`](/plugins/collector-ts/) or any collector that provides constants
:::

Built-in rules for detecting connascence in source code. The taxonomy and definitions used here follow [connascence.io](https://connascence.io).

## Rules

| Rule | Connascence Type | Purpose | Config |
|---|---|---|---|
| [`com`](./com.md) | [Connascence of Meaning](https://connascence.io/meaning.html) | Detect repeated string and numeric literals across files | Optional |
| [`cop-args`](./cop-args.md) | [Connascence of Position](https://connascence.io/position.html) | Detect functions with too many or boolean positional parameters | Optional |
| [`cop-struct`](./cop-struct.md) | [Connascence of Position](https://connascence.io/position.html) | Detect index-based access to arrays and tuples | Optional |

## Usage

Load all rules at once using the default export:

```ts
import { defineConfig } from '@maat-tools/core';
import connascenceRules from '@maat-tools/connascence-rules';

export default defineConfig({
	rules: [connascenceRules],
});
```

Use the `rule()` helper to configure individual rules:

```ts
import { defineConfig, rule } from '@maat-tools/core';

export default defineConfig({
	rules: [
		rule('@maat-tools/connascence-rules/cop', { maxArgumentsAllowed: 3 }),
		rule('@maat-tools/connascence-rules/com', { threshold: 4 }),
	],
});
```

Or import rules directly:

```ts
import com from '@maat-tools/connascence-rules/com';
import cop from '@maat-tools/connascence-rules/cop';

export default defineConfig({
	rules: [
		cop({ maxArgumentsAllowed: 3 }),
		com({ threshold: 4, ignoreValues: ['pending'] }),
	],
});
```
