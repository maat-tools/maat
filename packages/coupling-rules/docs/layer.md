# `layer(target)`

::: info Needs
`imports` — from [`@maat-tools/collector-ts`](/plugins/collector-ts/) or any collector that provides imports
:::

`layer(target)` builds a rule for enforcing import boundaries. Two modes are supported, auto-detected from the target string.

## Builder API

```ts
import { layer, Pure } from '@maat-tools/coupling-rules';

layer(target)
	.is(Pure)
	.allows(...patterns)
	.build();
```

`Pure` accepts an optional package-mode transitive check setting:

```ts
layer(target)
	.is(Pure, { transitive: false })
	.allows(...patterns)
	.build();
```

`.allows()` accepts any mix of strings and regular expressions:

| Pattern | What it matches |
|---|---|
| `'@scope/pkg'` | Exact package name, and any sub-path like `@scope/pkg/types` |
| `'node:crypto'` | Exact built-in module |
| `'./src/shared/**'` | Any file path under `src/shared/` at any depth, in path mode only |
| `'./src/shared/*'` | Direct children of `src/shared/` only, in path mode only |
| `/^node:/` | Any value matching the regular expression |

## Package Mode

Target is a package name, with no leading `./`.

```ts
layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts').build();
```

The rule watches every import recorded with `packageName === target`. For each one:

- Relative `./` and `../` specifiers are skipped.
- Any specifier not matched by `allows()` is flagged.
- For `Pure` rules, allowed local package dependencies are followed transitively by default.

| File | Import | Result |
|---|---|---|
| `packages/kernel/src/index.ts` | `@maat-tools/contracts` | Allowed: exact match |
| `packages/kernel/src/index.ts` | `@maat-tools/contracts/types` | Allowed: sub-path of allowed entry |
| `packages/kernel/src/index.ts` | `@maat-tools/core` | Blocked: not in `allows()` |
| `packages/kernel/src/index.ts` | `node:crypto` | Blocked: not in `allows()` |
| `packages/kernel/src/index.ts` | `./utils` | Allowed: relative import |
| `packages/contracts/src/index.ts` | `node:crypto` | Blocked for kernel when reached through allowed `@maat-tools/contracts` |

## Path Mode

Target starts with `./`, so the rule operates on file paths instead of package names.

```ts
layer('./src/domain/**').allows('./src/shared/**', 'react').build();
```

The rule watches every import whose `file` matches the target glob. For each one:

- Same-directory `./` specifiers are skipped.
- Parent-directory `../` specifiers are resolved to canonical project-relative paths.
- Resolved paths and package names are checked against `allows()`.

| File | Import | Resolved to | Result |
|---|---|---|---|
| `src/domain/service.ts` | `./utils` | - | Allowed: same-directory import |
| `src/domain/service.ts` | `../shared/auth` | `src/shared/auth` | Allowed: matches `./src/shared/**` |
| `src/domain/user/service.ts` | `../../shared/auth` | `src/shared/auth` | Allowed: same destination from deeper file |
| `src/domain/service.ts` | `react` | `react` | Allowed: exact package match |
| `src/domain/service.ts` | `../infrastructure/db` | `src/infrastructure/db` | Blocked: matches no pattern |
| `src/domain/service.ts` | `lodash` | `lodash` | Blocked: not in `allows()` |
| `src/infrastructure/db.ts` | `lodash` | - | Ignored: file is outside target layer |

## Mixing Paths and Packages

Path globs and package names are matched independently. A package specifier is never tested against a path glob, and a resolved file path is never tested against a plain package string.

```ts
layer('./src/domain/**').allows('./src/shared/**', '@company/ui').build();
```

If `allows()` only contains path globs, package imports such as `react` or `node:fs` are blocked until explicitly allowed.

## Glob Depth

| Glob | Matches |
|---|---|
| `./src/domain/**` | `src/domain/service.ts`, `src/domain/user/service.ts`, `src/domain/a/b/c.ts` |
| `./src/domain/*` | `src/domain/service.ts` only |

## `is(Pure)`

`is(Pure)` marks the rule as a pure layer boundary. Direct imports must match `allows()`.

In package mode, purity is transitive by default. If `@maat-tools/kernel` allows `@maat-tools/contracts`, and `@maat-tools/contracts` imports `node:crypto`, the kernel rule reports `node:crypto` unless kernel also allows it.

Use `{ transitive: false }` to preserve direct-only behavior:

```ts
layer('@maat-tools/kernel')
	.is(Pure, { transitive: false })
	.allows('@maat-tools/contracts')
	.build();
```
