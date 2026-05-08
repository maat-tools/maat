# `@maat-tools/coupling-rules`

Rules for enforcing import boundaries. Two modes are supported, auto-detected from the target string.

---

## `layer(target)` — builder API

```ts
import { layer, Pure } from '@maat-tools/coupling-rules';

layer(target)
  .is(Pure)          // optional — marks this as a Pure (side-effect-free) layer
  .allows(...patterns) // zero or more strings or RegExps
  .build()           // returns a Rule<'imports'>
```

`.allows()` accepts any mix of:

| Pattern | What it matches |
|---|---|
| `'@scope/pkg'` | exact package name, and any sub-path like `@scope/pkg/types` |
| `'node:crypto'` | exact built-in module |
| `'./src/shared/**'` | any file path under `src/shared/` at any depth (path mode only) |
| `'./src/shared/*'` | direct children of `src/shared/` only — does not descend (path mode only) |
| `/^node:/` | regexp — matches any Node built-in |

---

## Package mode — `layer('@scope/pkg')`

Target is a **package name** (no leading `./`).

The rule watches every import recorded with `packageName === target`. For each one:

- **Skips** `./` and `../` specifiers — relative imports are internal by definition.
- **Flags** any specifier not matched by `allows()`.

### Example

```ts
layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts').build()
```

| File | Import | Result |
|---|---|---|
| `packages/kernel/src/index.ts` | `@maat-tools/contracts` | ✅ allowed — exact match |
| `packages/kernel/src/index.ts` | `@maat-tools/contracts/types` | ✅ allowed — sub-path of allowed entry |
| `packages/kernel/src/index.ts` | `@maat-tools/core` | 🚫 blocked — not in allows |
| `packages/kernel/src/index.ts` | `node:crypto` | 🚫 blocked — not in allows |
| `packages/kernel/src/index.ts` | `./utils` | ✅ allowed — relative, skipped |
| `packages/kernel/src/index.ts` | `../types` | ✅ allowed — relative, skipped |
| `packages/contracts/src/index.ts` | `node:crypto` | ✅ ignored — wrong package |
| `packages/cli/src/index.ts` | `@maat-tools/core` | ✅ ignored — wrong package |

### Purity is per-package

`.is(Pure)` does **not** transitively police dependencies. Each package declares its own rule. Transitive purity is enforced by requiring every package in the dependency chain to also declare a `Pure` rule.

```ts
// @maat-tools/contracts is allowed to use node:crypto — it declared so itself.
// @maat-tools/kernel only cares about its own direct imports.
layer('@maat-tools/contracts').is(Pure).allows('node:crypto').build()
layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts').build()
```

### Cross-package relative imports

The collector normalizes cross-package relative imports to the destination package name before the rule ever sees them. So `../../../packages/cli/src/index` arriving from a `@maat-tools/kernel` file becomes `@maat-tools/cli` in `facts.imports`, and the rule catches it normally.

Same-package relative imports (`./utils`, `../types`) are kept as-is and always skipped.

---

## Path mode — `layer('./src/domain/**')`

Target starts with `./` — the rule operates on **file paths** instead of package names.

The rule watches every import whose `file` matches the target glob. For each one:

- **Skips** `./` specifiers — same-directory imports are always within the same layer.
- **Resolves** `../` specifiers: `normalize(join(dirname(file), specifier))` collapses them to a canonical project-relative path before matching.
- **Checks** the resolved value (or raw package name) against `allows()`.

This means `../../shared/auth` and `../../../shared/auth` both resolve to `src/shared/auth` regardless of how many directories deep the importing file sits.

### Example

```ts
layer('./src/domain/**').allows('./src/shared/**', 'react').build()
```

| File | Import | Resolved to | Result |
|---|---|---|---|
| `src/domain/service.ts` | `./utils` | — | ✅ allowed — `./` skipped |
| `src/domain/service.ts` | `../shared/auth` | `src/shared/auth` | ✅ allowed — matches `./src/shared/**` |
| `src/domain/user/service.ts` | `../../shared/auth` | `src/shared/auth` | ✅ allowed — same destination, deeper file |
| `src/domain/service.ts` | `react` | `react` | ✅ allowed — exact package match |
| `src/domain/service.ts` | `../infrastructure/db` | `src/infrastructure/db` | 🚫 blocked — matches no pattern |
| `src/domain/service.ts` | `lodash` | `lodash` | 🚫 blocked — not in allows |
| `src/domain/service.ts` | `node:fs` | `node:fs` | 🚫 blocked — not in allows |
| `src/infrastructure/db.ts` | `lodash` | — | ✅ ignored — file not in `src/domain/**` |
| `src/shared/utils.ts` | `lodash` | — | ✅ ignored — file not in `src/domain/**` |

### Mixing path globs and package names in allows

Path globs (`./...`) and package names are matched independently. A package specifier is never tested against a path glob, and a resolved file path is never tested against a plain package string.

```ts
// allows both a folder and a package — each matches its own kind
layer('./src/domain/**')
  .allows('./src/shared/**', '@company/ui')
  .build()
```

If `allows()` only contains path globs, any package import (e.g. `react`, `node:fs`) will be blocked. Add the package explicitly if it should be allowed.

### `*` vs `**`

| Glob | Matches |
|---|---|
| `./src/domain/**` | `src/domain/service.ts`, `src/domain/user/service.ts`, `src/domain/a/b/c.ts` |
| `./src/domain/*` | `src/domain/service.ts` only — does not descend into subdirectories |

---

## `is(Pure)` role

Purely cosmetic from an enforcement perspective — the evaluation logic is identical. It changes:

- The rule `id` prefix: `coupling/pure-imports:…` instead of `coupling/layer-imports:…`
- The finding message: includes `"for Pure layer"`

Use it to signal intent: a Pure layer promises no side effects and no unexpected dependencies.
