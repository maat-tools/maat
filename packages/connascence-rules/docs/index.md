# `@maat-tools/connascence-rules`

## What is connascence?

Two components are connascent when a change to one requires a corresponding change to the other. Every non-trivial codebase has connascence — the goal is not to eliminate it but to keep it at the weakest form possible.

Connascence is measured along two axes:

- **Strength** — the form of connascence, ordered from weakest to strongest: Name → Type → Meaning → Position → Algorithm.
- **Degree** — how many components are involved. The more components share a dependency, the more expensive a change becomes.

**The refactoring direction is always toward weaker forms.** Replacing a positional tuple `[userId, role]` with a named object `{ userId, role }` moves from Connascence of Position to Connascence of Name — a real improvement. The inverse (introducing positional coupling where named coupling existed) is always a regression.

Some connascence cannot be removed, only contained. When two components must share an invariant (a serialization format, a hash algorithm, a protocol), the coupling is real — the question is whether it is explicit and localized, or implicit and spread across the codebase.

Built-in rules for detecting connascence in source code. The taxonomy and definitions used here follow [connascence.io](https://connascence.io).

## Rules

| Rule | Connascence Type | Purpose | Config |
|---|---|---|---|
| [`com`](./com.md) | [Connascence of Meaning](https://connascence.io/meaning.html) | Detect repeated string and numeric literals across files | Optional |
| [`com-semantic`](./com-semantic.md) | [Connascence of Meaning](https://connascence.io/meaning.html) | Detect functions that return the same value with different meanings (requires LLM enricher) | Required |
| [`cop-args`](./cop-args.md) | [Connascence of Position](https://connascence.io/position.html) | Detect functions with too many or boolean positional parameters | Optional |
| [`cop-struct`](./cop-struct.md) | [Connascence of Position](https://connascence.io/position.html) | Detect index-based access to arrays and tuples | Optional |
| [`coa-technical`](./coa-technical.md) | [Connascence of Algorithm](https://connascence.io/algorithm.html) | Detect complementary operations sharing an invariant without a shared abstraction | Optional (rule options) — but the collector must be configured with `algorithmicPatterns` or no facts exist |

## Usage

Load the default rule set by package name:

```ts
import { defineConfig } from '@maat-tools/core';

export default defineConfig({
	rules: ['@maat-tools/connascence-rules'],
});
```

The default set contains `com`, `cop-args`, `cop-struct`, and `coa-technical`. It does **not** include `com-semantic`, which must be configured individually (it requires an enricher and a mandatory `threshold` option).

Use the `rule()` helper to configure individual rules:

```ts
import { defineConfig, rule } from '@maat-tools/core';

export default defineConfig({
	rules: [
		rule('@maat-tools/connascence-rules/cop-args', { maxArgumentsAllowed: 3 }),
		rule('@maat-tools/connascence-rules/com', { threshold: 4 }),
	],
});
```

Or import rules directly:

```ts
import com from '@maat-tools/connascence-rules/com';
import copArgs from '@maat-tools/connascence-rules/cop-args';

export default defineConfig({
	rules: [
		copArgs({ maxArgumentsAllowed: 3 }),
		com({ threshold: 4, ignoreValues: ['pending'] }),
	],
});
```
