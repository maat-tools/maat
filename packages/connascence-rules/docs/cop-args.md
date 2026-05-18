# `cop-args`

::: info Needs
`functionSignatures` — from [`@maat-tools/collector-ts`](/plugins/collector-ts/) or any collector that provides function signatures
:::

`cop-args` detects Connascence of Position in function signatures: call sites depend on the order of positional arguments, making every caller a silent dependency on the function's shape.

## What It Checks

This rule inspects collected function signatures — including standalone functions and class methods — and flags those that match configured thresholds:

- Functions and methods with more arguments than `maxArgumentsAllowed` (default: 3).
- Functions and methods that include at least one boolean parameter (when `flagBoolean` is enabled, default: true).
- By default, only exported functions and non-private methods are checked (`onlyExported: true`). For class methods, "exported" means any method that is not `private` — both `public` and `protected` methods are included.

Boolean parameters are a common form of Connascence of Position because callers must silently remember which position carries which intent (`true` = active? `true` = archived? `true` = dry-run?). Replacing a boolean with a named option or a discriminated union eliminates the ambiguity.

::: details What this rule detects

Functions and methods flagged because callers depend on argument order without any named signal.

```ts
// flagged: 4 arguments — exceeds default threshold of 3
export function createUser(
  name: string,
  email: string,
  role: string,
  age: number,
) {}

// flagged: boolean parameter — callers must silently remember what each position means
//   createUser("Alice", "...", "admin", 30, true)  ← what does `true` mean here?
export function sendEmail(
  to: string,
  subject: string,
  isHtml: boolean,
) {}

// flagged: both violations — boolean params + exceeds threshold
export class UserService {
  updateUser(
    id: string,
    data: UserData,
    notify: boolean,
    force: boolean,
    version: number,
  ) {}
}
```

Findings:

```txt
"createUser" — 4 params exceeds threshold of 3
"sendEmail" — contains boolean param
"UserService.updateUser" — contains boolean param; 5 params exceeds threshold of 3
```

:::

## Options

```ts
type CoPArgsRuleOptions = {
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

## Configuration

```ts
import { defineConfig, rule } from '@maat-tools/core';

export default defineConfig({
	rules: [
		rule('@maat-tools/connascence-rules/cop-args', { maxArgumentsAllowed: 3 }),
	],
});
```

Or with the direct import:

```ts
import copArgs from '@maat-tools/connascence-rules/cop-args';

export default defineConfig({
	rules: [
		copArgs({ maxArgumentsAllowed: 3 }),
	],
});
```

If a function or method exceeds the threshold or contains boolean parameters, the rule reports:

```txt
"createUser" — 4 params exceeds threshold of 3
"sendEmail" — contains boolean param
"UserService.updateUser" — contains boolean param; 5 params exceeds threshold of 3
```

## Limitations

- **No data flow analysis**: The rule only looks at the function definition, not how callers actually use the arguments. A function with 5 parameters where 3 have defaults and callers only pass 2 will still be flagged.
- **Type-based boolean detection**: Boolean parameters are identified by their type text. Custom types that resolve to `boolean` (e.g., type aliases) may not always be caught.
- **No overload awareness**: If a function has multiple overloads, each is evaluated independently.

## Finding Identity

Findings are identified by function/method name and its full parameter list:

```ts
ruleIdentifier: { function, params }
```

For class methods, `function` is formatted as `ClassName.methodName`. `params` is included so that overloaded functions with the same name but different signatures are treated as distinct findings. The `params` value is a string like `"name: string, age: number, active: boolean"`.
