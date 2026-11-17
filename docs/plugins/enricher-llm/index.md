# `@maat-tools/enricher-llm`

LLM-backed enrichers that consume deterministic facts from collectors and produce facts that require human verification.

**Status:** This package is pre-1.0. The shared types are stable; the COM enricher is the first fully implemented enricher.

## What it does

This package provides enrichers that use large language models to interpret meaning from collected facts. Unlike deterministic collectors, these enrichers produce **probabilistic facts**: the same input may yield different interpretations across runs or model versions.

The kernel handles this automatically:

- Any finding that depends on an enriched fact is marked with `requiresVerification: true`.
- The CLI displays a `[Verify]` badge.
- The finding does not fail strict mode on its own. A resolved fingerprint that returns fails as a regression even while awaiting verification. With `maat check --ledger`, it is appended to the ledger as a `finding.unverified` event; it only becomes an observed finding after a human confirms it with `maat verify --fingerprint <fp>` (or is discarded with `--revoke`).

## Shared types

All enrichers in this package accept a common base configuration:

```ts
import type { EnricherLLMInput, LLMConfig, LLMModel, LLMProvider } from '@maat-tools/enricher-llm'
```

`EnricherLLMInput` is the `KnownLLMConfig` union from `@maat-tools/utils`. It constrains provider/model pairs and their `extra` options to those registered in the implementation. `LLMConfig` is the generic configuration type; `LLMModel` is the model interface.

The package exports `LLMProvider` as a type. The `GeminiAIModel` runtime constant is exported by `@maat-tools/utils`; `LLMProvider` is exported there as a type as well.

For example, this is one supported configuration:

```ts
import type { EnricherLLMInput } from '@maat-tools/enricher-llm'

const config = {
  provider: 'vertex',
  model: 'gemini-3-5-flash',
  extra: { project: 'my-gcp-project', location: 'us-central1' },
} satisfies EnricherLLMInput
```

Vertex requires `extra.project` and `extra.location` at construction even though the fields are optional in the shared type. Other providers use their own credentials and options. See [LLM models and providers](/guide/llm-models) for the supported configurations and authentication setup.

## Available enrichers

| Enricher | Id | Needs | Provides | Feeds |
|---|---|---|---|---|
| [Connascence of Meaning (COM)](/plugins/enricher-llm/com) | `maat-tools/enricher-llm/com@v1` | `functionSignatures` | `comCandidates` | [`com-semantic`](/plugins/connascence-rules/com-semantic) |

Each enricher has its own page with configuration and fact shapes.

## Caching

Responses are cached by default under `.maat/cache/enrichers/<enricher-id>/`, relative to the project root. Each key includes the serialized item, prompt instructions, and provider/model pair. A readable entry with the same key is reused; missing, unreadable, changed, or bypassed entries can trigger external calls. Entries are per item, and unused entries are pruned after the run.

Sharing the cache can let another environment reuse the same enriched facts. Review it before committing: it contains source-derived information. A run avoids LLM calls only when every requested item has a usable cache entry and caching is enabled. Credentials and provider configuration are still needed to construct the model.

The cache path is set by the implementation; there is no environment variable to override it. To bypass cached responses for a run, use [`maat check --no-cache`](/commands/check).

## Tradeoffs

### Cost and latency

LLM calls add latency and cost when code changes. The [cache](#caching) reduces repeat calls when matching entries are available. Cache misses and `--no-cache` can incur cost even for unchanged code.

### Determinism

Rules remain pure and deterministic for the same facts. LLM-produced facts can vary, so the system marks findings that depend on them for human review. See the [Enrichers guide](/guide/enrichers) for the full explanation.

### Verification overhead

Every finding produced from an enriched fact requires human verification before it becomes actionable. Only use LLM enrichers for patterns that truly cannot be detected deterministically.

## Related

- [Enrichers guide](/guide/enrichers)
- [ADR-011: Enrichers — Probabilistic Facts Without Breaking Determinism](/adr/011-enrichers-probabilistic-facts)
- [`maat verify`](/commands/verify)
