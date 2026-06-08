# `@maat-tools/enricher-llm`

LLM-backed enrichers that consume deterministic facts from collectors and produce facts that require human verification.

**Status:** This package is pre-1.0. The shared types are stable, but individual enrichers may still be stubs.

## What it does

This package provides enrichers that use large language models to interpret meaning from collected facts. Unlike deterministic collectors, these enrichers produce **probabilistic facts**: the same input may yield different interpretations across runs or model versions.

The kernel handles this automatically:

- Any finding that depends on an enriched fact is marked with `requiresVerification: true`.
- The CLI displays a `[Verify]` badge.
- The finding never breaks strict builds and never goes to the ledger until a human verifies it.

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
type EnricherLLMInput = LLMConfig
```

## Connascence of Algorithm (COA) enricher

```ts
import coa from '@maat-tools/enricher-llm/coa'

export default defineConfig({
  collectors: ['@maat-tools/collector-ts'],
  enrichers: [
    ['@maat-tools/enricher-llm/coa', {
      provider: 'vertex',
      model: 'gemini-3-5-flash',
    }],
  ],
  rules: ['@maat-tools/connascence-rules'],
})
```

**Note:** The COA enricher is currently a stub. It returns empty results while the semantic similarity implementation is being refined.

## Tradeoffs

### Cost and latency

LLM calls add latency and cost to every run. Maat automatically caches every LLM response at `.maat/enricher-cache/`, keyed by content hash, model version, and prompt instructions. Cache entries are per-item (not per-batch), so only changed code triggers new LLM calls. Commit `.maat/enricher-cache/` for reproducible runs across CI environments.

### Determinism

**This package does not break Maat's determinism guarantee.** Rules remain pure and deterministic. The probabilistic nature is contained in the facts, and the system marks the findings that depend on them. See the [Enrichers guide](/guide/enrichers) for the full explanation.

### Verification overhead

Every finding produced from an enriched fact requires human verification before it becomes actionable. Only use LLM enrichers for patterns that truly cannot be detected deterministically.

## Related

- [Enrichers guide](/guide/enrichers)
- [ADR-011: Enrichers — Probabilistic Facts Without Breaking Determinism](/adr/011-enrichers-probabilistic-facts)
- [`maat verify`](/commands/verify)
