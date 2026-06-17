# `@maat-tools/enricher-llm`

LLM-backed enrichers that consume deterministic facts from collectors and produce facts that require human verification.

**Status:** This package is pre-1.0. The shared types are stable; the COM enricher is the first fully implemented enricher.

## What it does

This package provides enrichers that use large language models to interpret meaning from collected facts. Unlike deterministic collectors, these enrichers produce **probabilistic facts**: the same input may yield different interpretations across runs or model versions.

The kernel handles this automatically:

- Any finding that depends on an enriched fact is marked with `requiresVerification: true`.
- The CLI displays a `[Verify]` badge.
- The finding never breaks strict builds. With `maat check --ledger`, it is appended to the ledger as a `finding.unverified` event; it only becomes an observed finding after a human confirms it with `maat verify --fingerprint <fp>` (or is discarded with `--revoke`).

## Shared types

All enrichers in this package accept a common base configuration:

```ts
import type { EnricherLLMInput, LLMConfig, LLMModel, LLMProvider } from '@maat-tools/enricher-llm'
```

### `LLMProvider`

```ts
const LLMProvider = {
  Vertex: 'vertex',
} as const

type LLMProvider = typeof LLMProvider[keyof typeof LLMProvider] // 'vertex'
```

### `GeminiAIModel`

```ts
const GeminiAIModel = {
  Gemini_3_5_Flash: 'gemini-3-5-flash',
} as const

type GeminiAIModel = typeof GeminiAIModel[keyof typeof GeminiAIModel]
```

### `LLMConfig`

```ts
type LLMConfig = {
  provider: 'vertex'
  model: 'gemini-3-5-flash'
  extra?: { project?: string; location?: string }
  timeoutMs?: number
}
```

### `EnricherLLMInput`

```ts
type EnricherLLMInput = KnownLLMConfig // from '@maat-tools/utils'
```

`KnownLLMConfig` is the union of all known provider/model configurations. Today that is:

```ts
{
  provider: 'vertex'
  model: 'gemini-3-5-flash'
  extra?: { project?: string; location?: string }
  timeoutMs?: number
}
```

The type marks `extra` as optional, but the Vertex Gemini model throws at construction time if `extra.project` and `extra.location` are not provided — always pass both.

## Available enrichers

| Enricher | Id | Needs | Provides | Feeds |
|---|---|---|---|---|
| [Connascence of Meaning (COM)](/plugins/enricher-llm/com) | `maat-tools/enricher-llm/com@v1` | `functionSignatures` | `comCandidates` | [`com-semantic`](/plugins/connascence-rules/com-semantic) |

Each enricher has its own page with configuration and fact shapes.

## Caching

**Every LLM response is cached by default.** Before any LLM call, each item is looked up in `.maat/enricher-cache/` by a key derived from the item's content, the prompt instructions, and the provider/model pair. If nothing changed — same code, same prompt, same model — the cached result is used and **the LLM is never called again** for that item. Only items whose key changed trigger new calls; entries are per-item, not per-batch, so one changed function re-asks about one function, not the whole batch. Stale entries for items that no longer exist are pruned automatically.

This has two consequences worth relying on:

- **Cost and latency are paid once per change**, not once per run. A CI run over unchanged code makes zero LLM calls.
- **Re-runs are reproducible.** Commit `.maat/enricher-cache/` with your repository and every environment — CI included — gets the exact same enriched facts without network access or repeated cost.

The cache location can be overridden with the `MAAT_ENRICHER_CACHE_DIR` environment variable.

To bypass the cache for a single run, use [`maat check --no-cache`](/commands/check).

## Tradeoffs

### Cost and latency

LLM calls add latency and cost when code changes. The [always-on cache](#caching-always-on) means unchanged items never trigger calls, so the cost scales with how much changed, not with how often you run.

### Determinism

**This package does not break maat's determinism guarantee.** Rules remain pure and deterministic. The probabilistic nature is contained in the facts, and the system marks the findings that depend on them. See the [Enrichers guide](/guide/enrichers) for the full explanation.

### Verification overhead

Every finding produced from an enriched fact requires human verification before it becomes actionable. Only use LLM enrichers for patterns that truly cannot be detected deterministically.

## Related

- [Enrichers guide](/guide/enrichers)
- [ADR-011: Enrichers — Probabilistic Facts Without Breaking Determinism](/adr/011-enrichers-probabilistic-facts)
- [`maat verify`](/commands/verify)
