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
  OpenAI: 'openai',
} as const

type LLMProvider = typeof LLMProvider[keyof typeof LLMProvider] // 'openai'
```

### `LLMModel`

```ts
const OpenAIModel = {
  GPT4o: 'gpt-4o',
  GPT4oMini: 'gpt-4o-mini',
} as const

type OpenAIModel = typeof OpenAIModel[keyof typeof OpenAIModel]
```

### `LLMConfig`

```ts
type LLMConfig = {
  provider: 'openai'
  model: 'gpt-4o' | 'gpt-4o-mini'
  apiKey?: string
  baseURL?: string
  timeoutMs?: number
  cacheDir?: string
}
```

### `EnricherLLMInput`

```ts
type EnricherLLMInput = LLMConfig
```

### `LLMConfig`

```ts
type LLMConfig = {
  provider: 'openai'
  model: 'gpt-4o' | 'gpt-4o-mini'
  apiKey?: string
  baseURL?: string
  timeoutMs?: number
  cacheDir?: string
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
      provider: 'openai',
      model: 'gpt-4o-mini',
      cacheDir: './.maat-enricher-cache',
    }],
  ],
  rules: ['@maat-tools/connascence-rules'],
})
```

**Note:** The COA enricher is currently a stub. It returns empty results while the semantic similarity implementation is being refined.

## Tradeoffs

### Cost and latency

LLM calls add latency and cost to every run. Use `cacheDir` in `LLMConfig` to cache responses keyed by content hash, model version, and prompt version. Commit the cache directory if you want reproducible runs across CI environments.

### Determinism

**This package does not break Maat's determinism guarantee.** Rules remain pure and deterministic. The probabilistic nature is contained in the facts, and the system marks the findings that depend on them. See the [Enrichers guide](/guide/enrichers) for the full explanation.

### Verification overhead

Every finding produced from an enriched fact requires human verification before it becomes actionable. Only use LLM enrichers for patterns that truly cannot be detected deterministically.

## Related

- [Enrichers guide](/guide/enrichers)
- [ADR-011: Enrichers — Probabilistic Facts Without Breaking Determinism](/adr/011-enrichers-probabilistic-facts)
- [`maat verify`](/commands/verify)
