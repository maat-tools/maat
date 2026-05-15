# `cop`

::: info Needs
`functionSignatures` — from [`@maat-tools/collector-ts`](/plugins/collector-ts/) or any collector that provides function signatures
:::

`cop` detects [Connascence of Position](https://connascence.io/position.html): call sites depend on the order or shape of positional arguments, making every caller a silent dependency on the function's signature.

## What It Checks

The rule inspects collected function signatures — including standalone functions and class methods — and flags any that match the configured thresholds:

- Functions and methods with more arguments than `maxArgumentsAllowed` (default: 3).
- Functions and methods that include at least one boolean parameter (when `flagBoolean` is enabled, default: true).
- By default, only exported functions and non-private methods are checked (`onlyExported: true`). For class methods, "exported" means any method that is not `private` — both `public` and `protected` methods are included.

For class methods, the function name is formatted as `ClassName.methodName`.

Boolean parameters are a common form of Connascence of Position because callers must silently remember which position carries which intent (`true` = active? `true` = archived? `true` = dry-run?). Replacing a boolean with a named option or a discriminated union eliminates the ambiguity.

## Options

```ts
type CoPRuleOptions = {
	flagBoolean?: boolean;
	maxArgumentsAllowed?: number;
	onlyExported?: boolean;
};
```

| Option | Default | Meaning |
|---|---:|---|
| `flagBoolean` | `true` | Flag any function or method with at least one boolean parameter |
| `maxArgumentsAllowed` | `3` | Flag any function or method exceeding this many arguments |
| `onlyExported` | `true` | Only flag exported functions and non-private methods |

All options have sensible defaults but can be tuned to match your project's conventions.

## Example

```ts
import { defineConfig, rule } from '@maat-tools/core';

export default defineConfig({
	rules: [
		rule('@maat-tools/connascence-rules/cop', { maxArgumentsAllowed: 3 }),
	],
});
```

Or with the direct import:

```ts
import cop from '@maat-tools/connascence-rules/cop';

export default defineConfig({
	rules: [
		cop({ maxArgumentsAllowed: 3 }),
	],
});
```

If a function or method exceeds the threshold or contains boolean parameters, the rule reports:

```txt
"createUser" — 4 params exceeds threshold of 3
"sendEmail" — contains boolean param
"UserService.updateUser" — contains boolean param; 5 params exceeds threshold of 3
```

## Finding Identity

Findings are identified by function/method name and its full parameter list:

```ts
ruleIdentifier: { function, params }
```

For class methods, `function` is formatted as `ClassName.methodName`. `params` is included so that overloaded functions with the same name but different signatures are treated as distinct findings. The `params` value is a string like `"name: string, age: number, active: boolean"`.
