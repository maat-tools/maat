# `com`

::: info Needs
`constants` — from [`@maat-tools/collector-ts`](/plugins/collector-ts/) or any collector that provides constants
:::

`com` detects [Connascence of Meaning](https://connascence.io/meaning.html): the same literal value appearing across multiple files often means separate pieces of code depend on the same hidden concept.

## What It Checks

The rule groups collected constants by value, then reports a finding when the same value appears in enough distinct files.

Ignored values:

- Empty and whitespace-only values.
- Universal low-signal values: `true`, `false`, `null`.
- Import specifiers, because imports are structural references rather than magic values.
- Any value listed in `ignoreValues`.

Language-specific keywords (`undefined` in JS/TS, `None` in Python, `nil` in Ruby) and common numeric literals (`0`, `1`, `-1`) are **not** filtered by default, because their noisiness is domain-dependent. Pass them via `ignoreValues` if needed.

::: details What this rule detects

The same literal `"customer_status"` appears across three unrelated files. No single file imports another — they are coupled only by the shared string value.

```ts
// src/payments/processor.ts
const STATUS_FIELD = "customer_status"
await db.update({ [STATUS_FIELD]: newStatus })

// src/users/profile.ts
if (row["customer_status"] === "active") {
  grantAccess(user)
}

// src/reports/monthly.ts
export const FILTER_KEY = "customer_status"
```

Finding:

```txt
"customer_status" appears in 3 files — possible Connascence of Meaning
```

:::

## Options

```ts
type CoMRuleOptions = {
	threshold?: number;
	ignoreValues?: string[];
};
```

| Option | Default | Meaning |
|---|---:|---|
| `threshold` | `2` | Minimum number of distinct files required before a value becomes a finding |
| `ignoreValues` | `[]` | Extra literal values to ignore |

## Configuration

```ts
import com from '@maat-tools/connascence-rules/com';

export default defineConfig({
	rules: [
		com({
			threshold: 2,
			ignoreValues: ['draft'],
		}),
	],
});
```

If `"customer_status"` appears in three files, the rule reports:

```txt
"customer_status" appears in 3 files - possible Connascence of Meaning
```

## Limitations

This rule detects **structural spread** — the same literal appearing in many files — but cannot detect **semantic ambiguity**, which is the deeper form of Connascence of Meaning.

The classic example from the original definition is a function that returns `None` (or `null`) both when an object is not found and when a database error occurs. Both call sites must silently remember which meaning applies. Static literal scanning cannot distinguish these cases because there is no syntactic signal separating the two intents.

Detecting semantic ambiguity would require tracking the same value across multiple **usage contexts** (e.g. a value returned in one place and checked in a condition elsewhere, with different surrounding logic). That pattern is detectable in principle — the `Constant` shape already carries a `context` field — but it produces false positives and belongs in a dedicated rule rather than here.

::: info Planned
A companion rule `com-ambiguous` is planned to flag values that appear in mixed usage contexts (e.g. both as `return` values and as `condition` operands across distinct files), surfacing candidates for the semantic ambiguity case described above.
:::

## Finding Identity

Findings are identified by literal value and kind:

```ts
ruleIdentifier: { value, kind }
```

This keeps the same finding stable when additional occurrences are added or removed, as long as the shared value remains. `kind` is included so that a string `"42"` and a number `42` are treated as distinct coupling signals — they may carry different semantic meanings even though their textual representations are identical.
