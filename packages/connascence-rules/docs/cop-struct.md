# `cop-struct`

::: info Needs
`positionalSources` — from [`@maat-tools/collector-ts`](/plugins/collector-ts/) or any collector that provides positional sources
`positionalAccesses` — from [`@maat-tools/collector-ts`](/plugins/collector-ts/) or any collector that provides positional accesses
:::

`cop-struct` detects Connascence of Position in array and tuple structures: code that accesses elements by numeric index creates a dependency on the order and shape of that data.

## What It Checks

This rule tracks positional data from its origin to every point where it is consumed:

**Sources detected:**
- Functions and methods with explicit tuple return types (e.g., `(): [string, number]`).
- Functions returning array literals without explicit return types (inferred from the `return` statement).
- Variable declarations initialized with array literals (e.g., `const config = ["admin", 8080]`).
- Variable declarations with type-asserted arrays (e.g., `const x = [1, "a"] as [number, string]`).
- Known positional API calls: `split`, `match`, `matchAll`, `Object.values`, `Object.entries`.
- Aliases of any of the above (e.g., `const copy = existingSource()`).

**Accesses detected:**
- Numeric index access (e.g., `arr[0]`, `arr[i]`, `arr[i + 1]`, `arr[getIndex()]`).
- Array destructuring (e.g., `const [a, b] = arr`).

The rule links sources to their accesses across files using call-site tracking, so a tuple returned in one file and consumed in another is fully traced.

::: details What this rule detects

Code that accesses data by position — either through a numeric index or destructuring — on a source that holds heterogeneous elements. The rule traces from definition to every consumption point, even across files.

```ts
// src/user.ts — source: function with explicit tuple return type
export function getUserDetails(): [string, string, number, boolean] {
  return ["Alice", "alice@example.com", 25, true]
}

// src/admin.ts — accesses: numeric index on a value returned from another file
import { getUserDetails } from './user'
const user = getUserDetails()
const age = user[2]     // caller must know: position 2 = age
const active = user[3]  // caller must know: position 3 = active flag

// inline: array literal with mixed types + index access in the same file
const config = ["postgres", 5432, true]
const port = config[1]  // position 1 = port number
```

Findings:

```txt
"getUserDetails" in src/user.ts — positional access at src/admin.ts, src/admin.ts
        ↳ role: [Source] location: src/user.ts:2:10 identifier: getUserDetails positions: [0]: string, [1]: string, [2]: number, [3]: boolean
        ↳ role: [Access] location: src/admin.ts:4:13 identifier: user kind: index index: 2
        ↳ role: [Access] location: src/admin.ts:5:16 identifier: user kind: index index: 3
```

:::

## Options

```ts
type CoPStructRuleOptions = {
	onlyHeterogeneous?: boolean;
};
```

| Option | Default | Meaning |
|---|---:|---|
| `onlyHeterogeneous` | `true` | Only flag positional sources with mixed types (e.g., `[string, number]`). Set to `false` to also flag homogeneous arrays where position carries semantic meaning. |

## Configuration

```ts
import { defineConfig, rule } from '@maat-tools/core';

export default defineConfig({
	rules: [
		rule('@maat-tools/connascence-rules/cop-struct', { onlyHeterogeneous: true }),
	],
});
```

Or with the direct import:

```ts
import copStruct from '@maat-tools/connascence-rules/cop-struct';

export default defineConfig({
	rules: [
		copStruct({ onlyHeterogeneous: false }),
	],
});
```

When a positional source is accessed, the rule reports:

```txt
"getUserDetails" in src/user.ts — positional access at src/admin.ts, src/report.ts
        ↳ role: [Source] location: src/user.ts:2:10 identifier: getUserDetails positions: [0]: string, [1]: string, [2]: number, [3]: boolean
        ↳ role: [Access] location: src/admin.ts:4:17 identifier: remoteUser kind: index index: 3
        ↳ role: [Access] location: src/report.ts:5:10 identifier: reportData kind: index index: 0
```

The message lists the file of every matched access (one entry per access, so the same file can appear more than once).

## Limitations

- **Literal type widening**: String/number/boolean literals are widened to their base types for the `isHeterogeneous` check. `['foo', 'bar']` is considered homogeneous (`string[]`). This is intentional to focus on structural risk, but means value-level positional dependencies in homogeneous arrays are only caught when `onlyHeterogeneous: false`.
- **Not all access patterns are covered**: Optional chaining (`arr?.[i]`), the `at()` method (`arr.at(-1)`), and `for...of` iteration are not currently detected. These are edge cases that can be added if they appear in real code.
- **No spread resolution**: Arrays with spread elements (e.g., `[...known, 'new']`) have partially unknown positions at static analysis time.
- **Call-site linking is name-based**: Cross-file tracking matches by the function name text. Aliased imports (`import { getUserDetails as fetch }`) are tracked through the alias, but dynamic calls (`window[funcName]()`) are not.
- **Relies on TypeScript type resolution**: If `ts-morph` cannot resolve a type (e.g., in the presence of complex generics), the source may be missed or misclassified.

## Finding Identity

Findings are identified by the source variable name and its defining file:

```ts
ruleIdentifier: { name, file }
```

Each finding includes two artifact types:
- **`role: [Source]`** — Where the positional data originates, including its position types.
- **`role: [Access]`** — Where the data is consumed, including the accessed index and access kind (`index` or `destructuring`).
