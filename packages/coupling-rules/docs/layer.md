# `layer(target)`

::: info Needs
`dependsOn` — from [`@maat-tools/collector-ts`](/plugins/collector-ts/) or any collector that provides dependency facts
:::

`layer(target)` builds a rule for enforcing import boundaries. Two modes are available: **Pure** and **Controlled**. `.build()` is required to produce the rule.

## Modes

**Pure** — the target has zero external dependencies. Only relative imports within the same package or path are allowed.

```ts
layer('@acme/core').is(Pure).build()
```

**Controlled** — the target may only import what is explicitly listed in `allows()`.

```ts
layer('@acme/payments')
  .allows('@acme/core', 'node:crypto')
  .build()
```

A Controlled rule can also verify transitive imports — that is, imports of allowed dependencies that would pull in something outside the boundary:

```ts
layer('@acme/payments')
  .allows('@acme/core')
  .build({ transitive: true })
```

## Builder API

```ts
import { layer, Pure } from '@maat-tools/coupling-rules';

// Pure — no external dependencies at all
layer(target).is(Pure).build()

// Controlled — explicit allow list
layer(target).allows(...patterns).build()

// Controlled + transitive check
layer(target).allows(...patterns).build({ transitive: true })
```

`.allows()` is chainable and accepts any mix of strings and regular expressions:

| Pattern | What it matches |
|---|---|
| `'@scope/pkg'` | Exact package name, and any sub-path like `@scope/pkg/types` |
| `'node:crypto'` | Exact Node.js built-in |
| `'src/shared/**'` | Any file path under `src/shared/` at any depth |
| `'src/shared/*'` | Direct children of `src/shared/` only |
| `/^node:/` | Any value matching the regular expression |

## Package Mode

Target is a package name (matched against `package.json` `name` fields found in the collected facts).

```ts
layer('@maat-tools/kernel').allows('@maat-tools/contracts').build()
```

The rule watches every import recorded under the target package. For each one:

- Relative `./` and `../` specifiers are skipped — same-package imports are always allowed.
- Any specifier not matched by `allows()` is flagged.

| File | Import | Result |
|---|---|---|
| `packages/kernel/src/index.ts` | `@maat-tools/contracts` | Allowed: exact match |
| `packages/kernel/src/index.ts` | `@maat-tools/contracts/types` | Allowed: sub-path of allowed entry |
| `packages/kernel/src/index.ts` | `@maat-tools/core` | Blocked: not in `allows()` |
| `packages/kernel/src/index.ts` | `node:crypto` | Blocked: not in `allows()` |
| `packages/kernel/src/index.ts` | `./utils` | Allowed: relative import |

## Path Mode

Target is a glob pattern over file paths. Path mode is active when the target does not match any known package name in the collected facts.

```ts
layer('src/domain/**').allows('src/shared/**', 'react').build()
```

Targets must not start with `./` or `../` — use paths relative to `process.cwd()` directly.

For each import whose `from` file matches the target glob:

- Same-directory `./` and parent-directory `../` specifiers are skipped.
- Resolved paths and package names are checked against `allows()`.

| File | Import | Resolved to | Result |
|---|---|---|---|
| `src/domain/service.ts` | `./utils` | — | Allowed: same-directory import |
| `src/domain/service.ts` | `../shared/auth` | `src/shared/auth` | Allowed: matches `src/shared/**` |
| `src/domain/user/service.ts` | `../../shared/auth` | `src/shared/auth` | Allowed: same destination from deeper file |
| `src/domain/service.ts` | `react` | `react` | Allowed: exact package match |
| `src/domain/service.ts` | `../infrastructure/db` | `src/infrastructure/db` | Blocked: matches no pattern |
| `src/domain/service.ts` | `lodash` | `lodash` | Blocked: not in `allows()` |
| `src/infrastructure/db.ts` | `lodash` | — | Ignored: file is outside the target layer |

## Mixing Paths and Packages

Path globs and package names are matched independently. A package specifier is never tested against a path glob, and a resolved file path is never tested against a plain package string.

```ts
layer('src/domain/**').allows('src/shared/**', '@company/ui').build()
```

If `allows()` contains only path globs, package imports such as `react` or `node:fs` are blocked until explicitly listed.

## Glob Depth

| Glob | Matches |
|---|---|
| `src/domain/**` | `src/domain/service.ts`, `src/domain/user/service.ts`, `src/domain/a/b/c.ts` |
| `src/domain/*` | `src/domain/service.ts` only |

## `is(Pure)`

`is(Pure)` marks the target as fully isolated: it may not import anything outside itself. Only same-package relative imports are allowed — there is no allow list.

```ts
layer('@maat-tools/contracts').is(Pure).build()
```

Use `is(Pure)` only when the target genuinely has zero external dependencies. If the target needs even one external import (including `node:crypto` or `node:path`), use `allows()` instead.

## Transitive Checks

`build({ transitive: true })` extends the Controlled check to the imports of every allowed dependency. If an allowed dependency itself pulls in something outside the boundary, the rule reports it as a transitive violation.

```ts
layer('@acme/payments')
  .allows('@acme/core')
  .build({ transitive: true })
```

If `@acme/core` imports `node:crypto` and `node:crypto` is not listed in `allows()`, the rule reports it as a transitive boundary violation.

Transitive checks are only available in Controlled mode. `is(Pure)` has no allow list, so `transitive` does not apply.

## Configuration

```ts
import { defineConfig } from '@maat-tools/core';
import { layer, Pure } from '@maat-tools/coupling-rules';

export default defineConfig({
  collectors: [
    ['@maat-tools/collector-ts', { tsConfigFilePath: './tsconfig.json' }],
  ],
  rules: [
    layer('@acme/core').is(Pure).build(),
    layer('@acme/payments').allows('@acme/core', 'node:crypto').build(),
    layer('@acme/infra').allows('@acme/core', '@acme/payments', 'node:fs').build({ transitive: true }),
  ],
});
```

## Finding Identity

Findings are identified by the boundary target and the blocked import specifier:

```ts
ruleIdentifier: { target, dependency }
```

In package mode, `target` is the package name (e.g. `@acme/payments`). In path mode, `target` is the glob (e.g. `src/domain/**`). A finding remains stable across runs as long as the same file in the same layer imports the same blocked specifier.
