# Enrichers

Enrichers are a new architectural layer in maat that sits between **collectors** and **rules**. Their sole purpose is to derive higher-level facts from lower-level facts.

An enricher consumes facts and produces new facts. Unlike a collector, it does not read the filesystem or network. Unlike a rule, it does not produce findings. It exists to enable **semantic interpretation** that static analysis cannot provide.

## Why enrichers exist

Some architectural patterns are invisible to AST-based analysis:

- Two functions implement the same business rule in different syntax (Connascence of Algorithm, semantic).
- Architecture drift between intended design and actual code.
- Semantic code smells that require interpreting meaning, not just parsing syntax.

These require a probabilistic model — typically an LLM — to interpret meaning. Enrichers provide a controlled path for this interpretation without violating the determinism of the rule layer.

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
| **Breaks strict build?** | Yes | **Never** |
| **Goes to ledger?** | Yes | **Yes** (as `finding.unverified` via `maat check --ledger`) |
| **Can be baselined?** | Yes | Yes — `maat baseline` baselines every non-baselined ledger record, including `finding.unverified` ones |

## Human-in-the-loop verification

Findings with `requiresVerification: true` are presented with a `[Verify]` badge. They never break CI builds. When `maat check --ledger` is used, they are written to the ledger as `finding.unverified`.

A human can verify a finding after reviewing it:

```bash
maat verify --fingerprint <fp>
```

This promotes the finding in the ledger from `finding.unverified` to `finding.observed`. On subsequent runs, when the kernel produces the same finding, the CLI reconciles against the ledger: if the fingerprint is in `observed` state, the finding loses `requiresVerification` and its `[Verify]` badge. It is now treated as a normal, deterministic finding — it can be persisted, baselined, and can break builds.

If a finding is a false positive, it can be dismissed:

```bash
maat verify --fingerprint <fp> --revoke
```

## Caching: every LLM response is cached, always

For the official `@maat-tools/enricher-llm` package, caching is not optional and has no off switch. Before any LLM call, each item is looked up in `.maat/enricher-cache/` by a key derived from the item's content, the prompt instructions, and the provider/model pair. **If nothing changed — same code, same prompt, same model — the cached result is used and the LLM is never called again for that item.** Only changed items trigger new calls; entries are per-item, so one changed function re-asks about one function, not the whole batch. Entries for items that no longer exist are pruned automatically.

Commit `.maat/enricher-cache/` with your repository. This makes enriched runs reproducible across machines and CI — same facts, no network access, no repeated cost — and it means LLM cost scales with how much code changed, not with how often `maat check` runs. The cache location can be overridden with the `MAAT_ENRICHER_CACHE_DIR` environment variable.

## Tradeoffs and design decisions

### Enrichers vs. deterministic alternatives

**Tradeoff:** Enrichers introduce non-determinism into the fact pipeline. Every finding that depends on an enriched fact requires human verification before it can be treated as actionable.

| Approach | Pros | Cons |
|---|---|---|
| **Deterministic collector + rule** | Fully reproducible, no human bottleneck | Cannot detect semantic patterns |
| **Enricher + rule** | Can detect semantic patterns | Requires human verification, adds latency to CI feedback |
| **LLM inside rule** | Same output as enricher | **Hard violation of ADR-006**. Breaks determinism contract. Not supported. |
| **LLM inside collector with cache** | Deterministic facts, reproducible | Collector becomes more complex; cache must be committed |

### Performance and cost

**Tradeoff:** LLM-backed enrichers add latency and cost when code changes.

- Enrichers run in parallel. Total latency is bounded by the slowest enricher, not the sum of all. They all receive the same snapshot of collected facts.
- The [always-on cache](#caching-every-llm-response-is-cached-always) means unchanged items never trigger LLM calls — a run over unchanged code makes zero calls.

### Verification fatigue

**Tradeoff:** Teams may accumulate many probabilistic findings that all require manual verification.

- Only use enrichers for patterns that truly cannot be detected deterministically.
- Prefer deterministic rules for structural checks (imports, layers, boundaries).
- Use enrichers for semantic checks that justify the human-in-the-loop cost.

### Determinism is preserved at the rule layer

**This is the most important tradeoff to understand.** The existence of enrichers does **not** mean maat rules are no longer deterministic. Rules remain pure functions:

- `Rule.evaluate(facts)` is still synchronous and deterministic.
- Rules do not call LLMs or make network requests.
- The kernel does not invoke LLMs.
- The non-determinism is explicitly bounded to the **fact layer**.

The maat philosophy is not contradicted: **rules are still deterministic**. The probabilistic nature is contained in the *facts*, and the system marks the *findings* that depend on them.

## Does this mean maat is no longer deterministic?

**No.** maat's determinism guarantee applies to the rule layer, not the entire pipeline. Here is the exact boundary:

| Layer | Deterministic? | Why |
|---|---|---|
| Collectors | Yes (for same filesystem state) | Produce deterministic facts |
| Enrichers | **No** (by design) | Interpret, synthesize, infer |
| Rules | **Yes** (guaranteed) | Pure function: same facts → same findings |
| Findings from deterministic facts | Yes | Fully reproducible |
| Findings from enriched facts | Flagged for verification | Explicitly marked as uncertain |

A finding that comes from deterministic facts is fully deterministic. A finding that comes from enriched facts is explicitly flagged and restricted until a human verifies it. Once verified, it is treated as deterministic.

This is **architectural separation with explicit contamination tracking**, not a breakdown of determinism.

## Enricher package structure

The `@maat-tools/enricher-llm` package provides shared types and utilities for LLM-backed enrichers:

```ts
import type { EnricherLLMInput } from '@maat-tools/enricher-llm'
```

| Type | Purpose |
|---|---|
| `EnricherLLMInput` | LLM configuration for the supported provider/model combinations (`provider`, `model`, optional `extra` and `timeoutMs`). Currently Google Vertex AI with Gemini models — see [LLM models](/guide/llm-models) |

## Related

- [ADR-011: Enrichers — Probabilistic Facts Without Breaking Determinism](/adr/011-enrichers-probabilistic-facts)
- [Determinism](/guide/determinism)
- [Plugin system](/guide/plugins)
- [`maat verify`](/commands/verify)
