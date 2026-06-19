# `layer(target)`

::: info Needs
`dependsOn` — from [`@maat-tools/collector-ts`](/plugins/collector-ts/) or any collector that provides dependency facts
:::

`layer(target)` builds a rule for enforcing import boundaries. Three modes are available: **Pure**, **Controlled (allowlist)**, and **Controlled (denylist)**. `.build()` is required to produce the rule.

## Modes

**Pure** — the target has zero external dependencies. Only relative imports within the same package or path are allowed.

```ts
layer('@acme/core').is(Pure).build()
```

**Controlled (allowlist)** — the target may only import what is explicitly listed in `allows()`. Every import not on the list is a violation.

```ts
layer('@acme/payments')
  .allows('@acme/core', 'node:crypto')
  .build()
```

**Controlled (denylist)** — the target may import anything *except* what is listed in `forbids()`. Every import that matches the list is a violation.

```ts
layer('@acme/payments')
  .forbids('@acme/infrastructure')
  .build()
```

Both Controlled modes support transitive checking — walking the import tree of internal dependencies and applying the same boundary rule at each depth:

```ts
layer('src/payments/**')
  .allows('src/core/**')
  .build({ transitive: true })

layer('src/domain/**')
  .forbids('src/infrastructure/**')
  .build({ transitive: true })
```

## Builder API

```ts
import { layer, Pure } from '@maat-tools/coupling-rules';

// Pure — no external dependencies at all
layer(target).is(Pure).build()

// Allowlist — explicit allow list
layer(target).allows(...patterns).build()

// Allowlist + transitive check
layer(target).allows(...patterns).build({ transitive: true })

// Denylist — explicit block list
layer(target).forbids(...patterns).build()

// Denylist + transitive check
layer(target).forbids(...patterns).build({ transitive: true })
```

`.allows()` and `.forbids()` are each chainable and accept any mix of strings and regular expressions. They cannot be mixed on the same rule — choose one mode per `layer()` call.

| Pattern | What it matches |
|---|---|
| `'@scope/pkg'` | Exact package name only — `@scope/pkg/types` does **not** match. Use `'@scope/pkg{,/**}'` to also allow sub-paths |
| `'node:crypto'` | Exact Node.js built-in |
| `'src/shared/**'` | Any file path under `src/shared/` at any depth |
| `'src/shared/*'` | Direct children of `src/shared/` only |
| `/^node:/` | Any value matching the regular expression |

## Package Mode

Target is a package name (matched against `package.json` `name` fields found in the collected facts).

```ts
// Allowlist
layer('@maat-tools/kernel').allows('@maat-tools/contracts').build()

// Denylist
layer('@maat-tools/kernel').forbids('@maat-tools/infrastructure').build()
```

The rule watches every import recorded under the target package. For each one:

- Relative `./` and `../` specifiers are skipped — same-package imports are always allowed.
- **Allowlist**: any specifier not matched by `allows()` is flagged.
- **Denylist**: any specifier matched by `forbids()` is flagged.

### Allowlist example

| File | Import | Result |
|---|---|---|
| `packages/kernel/src/index.ts` | `@maat-tools/contracts` | Allowed: exact match |
| `packages/kernel/src/index.ts` | `@maat-tools/contracts/types` | Blocked: sub-paths do not match the plain pattern — add `'@maat-tools/contracts{,/**}'` to allow them |
| `packages/kernel/src/index.ts` | `@maat-tools/core` | Blocked: not in `allows()` |
| `packages/kernel/src/index.ts` | `node:crypto` | Blocked: not in `allows()` |
| `packages/kernel/src/index.ts` | `./utils` | Allowed: relative import |

### Denylist example

| File | Import | Result |
|---|---|---|
| `packages/kernel/src/index.ts` | `@maat-tools/infrastructure` | Blocked: matches `forbids()` |
| `packages/kernel/src/index.ts` | `@maat-tools/contracts` | Allowed: not in `forbids()` |
| `packages/kernel/src/index.ts` | `node:crypto` | Allowed: not in `forbids()` |
| `packages/kernel/src/index.ts` | `./utils` | Allowed: relative import |

## Path Mode

Target is a glob pattern over file paths. Path mode is active when the target does not match any known package name in the collected facts.

```ts
// Allowlist
layer('src/domain/**').allows('src/shared/**', 'react').build()

// Denylist
layer('src/domain/**').forbids('src/infrastructure/**').build()
```

Targets must not start with `./` or `../` — use paths relative to `process.cwd()` directly.

For each import whose `from` file matches the target glob:

- Same-directory `./` and parent-directory `../` specifiers are skipped.
- **Allowlist**: resolved paths and package names are checked against `allows()`.
- **Denylist**: resolved paths and package names are checked against `forbids()`.

### Allowlist example

| File | Import | Resolved to | Result |
|---|---|---|---|
| `src/domain/service.ts` | `./utils` | — | Allowed: same-directory import |
| `src/domain/service.ts` | `../shared/auth` | `src/shared/auth` | Allowed: matches `src/shared/**` |
| `src/domain/user/service.ts` | `../../shared/auth` | `src/shared/auth` | Allowed: same destination from deeper file |
| `src/domain/service.ts` | `react` | `react` | Allowed: exact package match |
| `src/domain/service.ts` | `../infrastructure/db` | `src/infrastructure/db` | Blocked: matches no pattern |
| `src/domain/service.ts` | `lodash` | `lodash` | Blocked: not in `allows()` |
| `src/infrastructure/db.ts` | `lodash` | — | Ignored: file is outside the target layer |

### Denylist example

| File | Import | Resolved to | Result |
|---|---|---|---|
| `src/domain/service.ts` | `./utils` | — | Allowed: same-directory import |
| `src/domain/service.ts` | `../shared/auth` | `src/shared/auth` | Allowed: not in `forbids()` |
| `src/domain/service.ts` | `../infrastructure/db` | `src/infrastructure/db` | Blocked: matches `src/infrastructure/**` |
| `src/domain/service.ts` | `react` | `react` | Allowed: not in `forbids()` |
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

`build({ transitive: true })` extends the Controlled check into the transitive dependency tree. Traversal starts from direct dependencies that are path-resolved (relative imports resolved to project-relative paths); the imports found under those paths are checked against the same rule, recursively.

### Transitive allowlist

```ts
layer('src/payments/**')
  .allows('src/core/**')
  .build({ transitive: true })
```

If `src/payments/checkout.ts` imports `../core/db` (allowed), and `src/core/db.ts` imports `pg` — which is not listed in `allows()` — the rule reports it as a transitive boundary violation.

### Transitive denylist

```ts
layer('src/domain/**')
  .forbids('src/infrastructure/**')
  .build({ transitive: true })
```

If `src/domain/service.ts` imports `./utils` (not forbidden), and `./utils` imports `../infrastructure/db` — which matches `forbids()` — the rule reports it as a transitive boundary violation.

### Traversal behaviour

- **External** dependencies (bare package specifiers such as `pg` or `node:crypto`) are treated as leaves in the allowlist traversal: there are no collected imports to follow under them. They can still be flagged when reached as a terminal import.
- **Internal** dependencies that violate the forbids pattern are flagged and not traversed further.
- Transitive checks are only available in Controlled mode. `is(Pure)` has no pattern list, so `transitive` does not apply.

## Choosing between allowlist and denylist

Use `allows()` when the set of permitted imports is small and stable — you want to lock down what can enter a layer. Any new dependency must be explicitly added to the list.

Use `forbids()` when the set of permitted imports is large or evolving and you only want to block specific problematic paths — for example, preventing domain code from reaching infrastructure packages without listing every allowed package.

The two modes cannot be combined on the same `layer()` call.

## Configuration

```ts
import { defineConfig } from '@maat-tools/core';
import { layer, Pure } from '@maat-tools/coupling-rules';

export default defineConfig({
  collectors: [
    ['@maat-tools/collector-ts', { tsConfigFilePath: './tsconfig.json' }],
  ],
  rules: [
    // Pure: zero external dependencies
    layer('@acme/core').is(Pure).build(),

    // Allowlist: only the listed packages are permitted
    layer('@acme/payments').allows('@acme/core', 'node:crypto').build(),

    // Allowlist + transitive: also checks what allowed deps pull in
    layer('@acme/infra').allows('@acme/core', '@acme/payments', 'node:fs').build({ transitive: true }),

    // Denylist: block specific packages, allow everything else
    layer('@acme/domain').forbids('@acme/infra').build(),

    // Denylist + transitive: also flags forbidden deps reached indirectly
    layer('src/domain/**').forbids('src/infrastructure/**').build({ transitive: true }),
  ],
});
```

## Finding Identity

Direct findings are identified by the boundary target and the blocked import specifier:

```ts
ruleIdentifier: { target, dependency }
```

Transitive findings additionally carry the intermediate path through which the blocked import was reached:

```ts
ruleIdentifier: { target, currentPath, dependency }
```

In package mode, `target` is the package name (e.g. `@acme/payments`). In path mode, `target` is the glob (e.g. `src/domain/**`). A finding remains stable across runs as long as the same file in the same layer imports the same blocked specifier (and, for transitive findings, through the same intermediate path).
