# `cop` (Connascence of Position)

Connascence of Position rules detect dependencies on the order or shape of positional data. The package provides two variants:

| Rule | Focus | Docs |
|---|---|---|
| [`cop-args`](./cop-args.md) | Function signatures — too many or boolean positional parameters | [cop-args](./cop-args.md) |
| [`cop-struct`](./cop-struct.md) | Array/tuple structures — index-based access to positional data | [cop-struct](./cop-struct.md) |

## Usage

```ts
import { defineConfig, rule } from '@maat-tools/core';

export default defineConfig({
	rules: [
		rule('@maat-tools/connascence-rules/cop-args', { maxArgumentsAllowed: 3 }),
		rule('@maat-tools/connascence-rules/cop-struct', { onlyHeterogeneous: true }),
	],
});
```
