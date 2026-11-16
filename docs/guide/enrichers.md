# Enrichers

Enrichers are optional plugins that run between **collectors** and **rules**. They derive additional facts from collected facts, including through LLM calls. Rules then check those facts against your configured constraints.

An enricher consumes facts and produces new facts. It works from collected facts rather than collecting repository facts itself; an LLM-backed enricher may make network calls and read or write a local cache. Unlike a rule, it does not produce findings. It exists to enable **semantic interpretation** that static analysis cannot provide.

## Why enrichers exist

Some questions require interpretation beyond syntax. Examples of questions a custom enricher and rule might explore include:

- Two functions implement the same business rule in different syntax (Connascence of Algorithm, semantic).
- Architecture drift between intended design and actual code.
- Semantic code smells that require interpreting meaning, not just parsing syntax.

These examples describe possible uses of the extension interface, not a list of detectors available today. The official package includes a Connascence of Meaning enricher. Enrichers provide a path for probabilistic interpretation without changing the determinism contract of the rule layer; resulting findings require human review.

## The execution pipeline

```
Collectors (I/O, deterministic)
    ↓
Enrichers (probabilistic)
    ↓
Rules (pure, deterministic)
    ↓
Findings
```

The kernel runs this in three phases:

1. **Collectors run in parallel** — gather facts from the filesystem and codebase.
2. **Enrichers run in parallel** — transform and augment facts. All enrichers receive the same snapshot of collected facts; they cannot depend on facts produced by other enrichers.
3. **Rules run in parallel** — consume facts (both raw and enriched) and produce findings.

## Writing an enricher

An enricher is a package with a default export created by `defineEnricher()` from `@maat-tools/contracts`.

```ts
import { type Enricher, defineEnricher } from '@maat-tools/contracts'

export type SimilarFunctionPair = {
  functionA: string
  functionB: string
  similarityReason: string
}

export type SemanticSimilarityEnricherOptions = {
  threshold: number
}

export class SemanticSimilarityEnricher
  implements Enricher<'acme.ts.functions', 'acme.semantic.similarity'>
{
  readonly id = 'acme.semantic-similarity'
  readonly needFacts = ['acme.ts.functions'] as const
  readonly provideFacts = ['acme.semantic.similarity'] as const

  constructor(private readonly options: SemanticSimilarityEnricherOptions) {}

  async enrich(facts: { 'acme.ts.functions': unknown[] }): Promise<{
    facts: { 'acme.semantic.similarity': SimilarFunctionPair[] }
    usedTokens?: number
    cost?: number
  }> {
    // Use an LLM or other probabilistic model to analyze functions
    // and identify semantic similarity.
    const pairs: SimilarFunctionPair[] = []

    // ... analysis logic ...

    return {
      facts: { 'acme.semantic.similarity': pairs },
    }
  }
}

// Extend maat's registries for TypeScript autocomplete
declare module '@maat-tools/contracts' {
  interface FactRegistry {
    'acme.semantic.similarity': SimilarFunctionPair[]
  }

  interface EnricherRegistry {
    '@acme/maat-enricher-semantic-similarity': SemanticSimilarityEnricherOptions
  }
}

export default defineEnricher(
  (options: SemanticSimilarityEnricherOptions) => new SemanticSimilarityEnricher(options),
)
```

## Using enrichers in config

```ts
import { defineConfig } from '@maat-tools/core'

// Import plugin packages so their declaration merging is visible
import '@acme/maat-enricher-semantic-similarity'

export default defineConfig({
  check: { strict: true },
  collectors: [['@acme/maat-collector-ts-functions', { root: './src' }]],
  enrichers: [['@acme/maat-enricher-semantic-similarity', { threshold: 0.85 }]],
  rules: [['@acme/maat-rule-connascence-algorithm', {}]],
})
```

## Probabilistic contamination

**All enrichers are probabilistic by definition.** They interpret, synthesize, or infer. There is no such thing as a "deterministic enricher" — if a transformation is deterministic, it belongs in a collector, a rule, or an insight.

When a rule consumes any fact produced by an enricher, the resulting finding is **contaminated** with uncertainty. The kernel marks it with `requiresVerification: true`. This is **probabilistic contamination**: the finding carries the uncertainty of its source.

The rule itself remains pure and deterministic. The finding is explicitly flagged as needing human review. The system does not pretend the finding is trustworthy.

## Consequences for findings

| Property | Deterministic finding | Probabilistic finding |
|---|---|---|
| **Source** | Facts from collectors only | Facts from enrichers (directly or mixed) |
| **Badge** | None | `[Verify]` in CLI output |
| **`requiresVerification`** | `false` / absent | `true` |
| **Fails the check?** | Visible findings fail in strict mode; regressions and expired baselines fail regardless | New unverified findings do not fail on their own; returning resolved findings fail as regressions even pending verification |
| **Goes to ledger?** | Yes | **Yes** (as `finding.unverified` via `maat check --ledger`) |
| **Can be baselined?** | Yes | Only after human verification changes the ledger state to `finding.observed` |

## Human-in-the-loop verification

Findings with `requiresVerification: true` are presented with a `[Verify]` badge. New unverified findings do not fail strict checks on their own. If a finding recorded as resolved returns, that regression fails the command even while verification is pending, regardless of strict mode. When `maat check --ledger` is used, pending findings are written as `finding.unverified`.

A human can verify a finding after reviewing it:

```bash
maat verify --fingerprint <fp>
```

`maat verify` records human acceptance as `finding.observed`. In the current implementation, later scans still carry `requiresVerification` when the kernel produces enriched findings; `check` does not clear the flag based on that ledger event. Verification alone therefore does not remove the `[Verify]` badge or make these findings fail strict mode. Returning resolved fingerprints still fail as regressions. Human acceptance does not make the underlying model deterministic. Baseline accepts observed findings and expired baselines; verify an unverified finding before baselining it.

If a finding is a false positive, it can be dismissed:

```bash
maat verify --fingerprint <fp> --revoke
```

## Caching

The official `@maat-tools/enricher-llm` package caches responses under `.maat/cache/enrichers/<enricher-id>/`. Each entry is keyed by the serialized item, prompt instructions, provider, and model. An available entry with the same key is reused. Missing entries trigger LLM calls; entries not used in the run are pruned.

You can commit `.maat/cache/enrichers/` to share results between local runs and CI. Reusing a complete cache avoids repeated LLM calls for those inputs. A missing cache entry, changed input, prompt, provider, or model can require a new call. The cache is stored beneath the resolved project root; the current implementation has no environment-variable override for its location.

To bypass the cache for a single run — for example, when you suspect cached enriched facts are stale or want to reproduce an issue without committing the cache — pass `--no-cache` to `maat check`:

```bash
maat check --no-cache
```

This forces all configured enrichers to re-run. It has no effect when no enrichers are configured.

## Tradeoffs and design decisions

### Enrichers vs. deterministic alternatives

**Tradeoff:** Enrichers introduce non-determinism into the fact pipeline. Findings that depend on enriched facts require human review. A returning resolved finding can still fail the check as a regression before verification.

| Approach | Pros | Cons |
|---|---|---|
| **Deterministic collector + rule** | Fully reproducible, no human bottleneck | Cannot detect semantic patterns |
| **Enricher + rule** | Can detect semantic patterns | Requires human verification, adds latency to CI feedback |
| **LLM inside rule** | Same output as enricher | **Hard violation of ADR-006**. Breaks determinism contract. Not supported. |
| **LLM inside collector with cache** | Deterministic facts, reproducible | Collector becomes more complex; cache must be committed |

### Performance and cost

**Tradeoff:** LLM-backed enrichers add latency and cost when code changes.

- Enrichers run in parallel. Total latency is bounded by the slowest enricher, not the sum of all. They all receive the same snapshot of collected facts.
- The [cache](#caching) avoids LLM calls when entries for the same inputs are available and cache use is enabled.

### Verification fatigue

**Tradeoff:** Teams may accumulate many probabilistic findings that all require manual verification.

- Only use enrichers for patterns that truly cannot be detected deterministically.
- Prefer deterministic rules for structural checks (imports, layers, boundaries).
- Use enrichers for semantic checks that justify the human-in-the-loop cost.

### Determinism is preserved at the rule layer

Enrichers can produce different facts on fresh runs. Rules still evaluate a given set of facts deterministically:

- `Rule.evaluate(facts)` is still synchronous and deterministic.
- Rules do not call LLMs or make network requests.
- The kernel does not invoke LLMs.
- The non-determinism is explicitly bounded to the **fact layer**.

The system marks findings that depend on probabilistic facts so their source remains visible during review.

## Does this mean maat is no longer deterministic?

**No.** maat's determinism guarantee applies to the rule layer, not the entire pipeline. Here is the exact boundary:

| Layer | Deterministic? | Why |
|---|---|---|
| Collectors | Yes (for same filesystem state) | Produce deterministic facts |
| Enrichers | **No** (by design) | Interpret, synthesize, infer |
| Rules | **Yes** (guaranteed) | Pure function: same facts → same findings |
| Findings from deterministic facts | Yes | Fully reproducible |
| Findings from enriched facts | Flagged for verification | Explicitly marked as uncertain |

Rule evaluation is deterministic for the same facts. Findings based on enriched facts require human review. Verification records acceptance in the ledger, but the current check retains the verification flag on new enriched findings. A returning resolved fingerprint can fail as a regression even pending verification.

## Enricher package structure

The `@maat-tools/enricher-llm` package provides shared types and utilities for LLM-backed enrichers:

```ts
import type { EnricherLLMInput } from '@maat-tools/enricher-llm'
```

| Type | Purpose |
|---|---|
| `EnricherLLMInput` | LLM configuration for the supported provider/model combinations (`provider`, `model`, optional `extra` and `timeoutMs`). See [LLM models](/guide/llm-models) for the providers and models supported by the current package |

## Related

- [ADR-011: Enrichers — Probabilistic Facts Without Breaking Determinism](/adr/011-enrichers-probabilistic-facts)
- [Determinism](/guide/determinism)
- [Plugin system](/guide/plugins)
- [`maat verify`](/commands/verify)
