# `com-semantic`

::: info Needs enricher
This rule requires the [`@maat-tools/enricher-llm/com`](/plugins/enricher-llm/) enricher. It will be skipped if the enricher is not configured.
:::

::: warning Probabilistic
Findings from this rule are probabilistic — they come from LLM analysis and carry uncertainty. They are shown with a `[Verify]` badge and require human verification before they become actionable. See [Enrichers](/guide/enrichers) for details.
:::

`com-semantic` detects the semantic form of [Connascence of Meaning](https://connascence.io/meaning.html): a function that returns the **same value** to represent multiple distinct outcomes. Callers must rely on out-of-band knowledge to interpret which meaning applies.

## What It Checks

The rule receives function signatures from the `@maat-tools/enricher-llm/com` enricher. The enricher analyzes functions that:

1. Have heterogeneous return sites (the function can return different types or values)
2. Return the same literal value from multiple sites with different surrounding logic

For each such function, the LLM determines whether the duplicate return value is a sign of CoM — where the same value encodes multiple distinct semantics that every caller must implicitly distinguish.

::: details What this rule detects

```ts
// A function that uses null to mean both "not found" and "error"
async function findUser(id: string): Promise<User | null> {
  try {
    const row = await db.query(id)
    if (!row) return null       // means: user does not exist
    return toUser(row)
  } catch {
    return null                 // means: database error
  }
}
```

Both return sites produce `null`, but they encode fundamentally different outcomes. A caller cannot distinguish "user does not exist" from "database connection failed" without reading the implementation.

Finding:

```txt
"null" value for the return type in function "findUser" might be a sign of Connascence of Meaning.
Reason: The function uses null both when the entity is not found and when a database error occurs...
(confidence: 0.95)
```

:::

## Options

```ts
type CoMSemanticRuleOptions = {
  threshold: `0.${string}` | '1'
}
```

| Option | Required | Meaning |
|---|:---:|---|
| `threshold` | Yes | Minimum LLM confidence (0.0–1.0) required to report a finding |

The threshold is a string literal to avoid floating-point ambiguity in config. Use values like `'0.7'`, `'0.8'`, `'0.9'`.

## Configuration

This rule requires the LLM enricher. Both must be configured together:

```ts
import { defineConfig } from '@maat-tools/core'
import '@maat-tools/enricher-llm/com'

export default defineConfig({
  collectors: ['@maat-tools/collector-ts'],
  enrichers: [
    ['@maat-tools/enricher-llm/com', {
      provider: 'vertex',
      model: 'gemini-3-5-flash',
      extra: { project: 'my-gcp-project', location: 'us-central1' },
    }],
  ],
  rules: [
    ['@maat-tools/connascence-rules/com-semantic', { threshold: '0.8' }],
  ],
})
```

## Relationship to `com`

The deterministic [`com`](./com.md) rule detects **structural spread**: the same literal appearing across many files. This is a syntactic signal — it finds candidates for shared coupling, but cannot determine intent.

`com-semantic` detects **semantic ambiguity** at the function level: the same value encoding multiple distinct outcomes within a single function's return contract. This is the form described in the original Connascence of Meaning definition.

The two rules are complementary and can be used together.

## Finding Identity

```ts
ruleIdentifier: { value, kind }
```

`value` is the pipe-separated list of return site values and their guards (e.g. `null[catch block]|null`). `kind` is the return type. Two findings for the same function are stable across runs as long as the return sites do not change.

## Related

- [`com`](./com.md) — deterministic structural spread detection
- [`@maat-tools/enricher-llm`](/plugins/enricher-llm/) — the enricher required by this rule
- [Enrichers guide](/guide/enrichers)
- [LLM models](/guide/llm-models)
- [`maat verify`](/commands/verify)
