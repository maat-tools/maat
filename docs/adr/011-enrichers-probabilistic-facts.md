# ADR-011: Enrichers — Probabilistic Facts Without Breaking Determinism

**Status:** Accepted  
**Date:** 2026-05-20

> **Current schema (2026-11-13):** The record types in the consequences below describe the design at adoption. ADR-012 replaces derived records with self-contained events; consult it for current persistence shapes. Current verification and regression behavior is explained below and in the [verify reference](../commands/verify.md).

## Context

maat's core architectural promise is deterministic rules (ADR-006). `Rule.evaluate(facts)` is a pure function: same facts always produce same findings. This makes the ledger auditable and findings reproducible.

Some analyses need semantic interpretation beyond the structural facts collected from an AST (abstract syntax tree). The following examples motivated the design; they are not a list of available detectors:

- Detecting that two functions implement the same business rule in different syntax (Connascence of Algorithm, semantic).
- Detecting architecture drift between intended design and actual code.
- Identifying semantic code smells that static analysis misses.

An enricher can use an LLM or another probabilistic model to propose an interpretation. The implemented COM enricher examines ambiguous return values; it does not implement all the examples above.

## The contradiction

ADR-006 states:

> "The kernel and rules never call an LLM. This boundary is required for reproducible findings."

And ADR-007 states:

> "LLM-inside-collector pattern [...] is the only sanctioned path for AI-assisted fact collection."

But if a **collector** uses an LLM, the **facts it produces are probabilistic**. A rule consuming those facts still runs a deterministic `evaluate()`, but the *finding itself* is probabilistic because its input was probabilistic. The rule is pure, but the finding is unreliable.

This creates an apparent contradiction: maat promises deterministic rules, but the only path for LLM usage (collectors) makes findings probabilistic. How can a deterministic rule produce a trustworthy finding from an untrustworthy fact?

## Decision

Introduce **Enricher** as a new architectural layer between collectors and rules.

An enricher consumes collected facts and produces new, probabilistic facts rather than findings. It can call external LLM providers and read or write response caches. Rules evaluate those facts without I/O.

**Crucially: all enrichers are probabilistic by definition.** They interpret, synthesize, or infer. There is no such thing as a "deterministic enricher" — if a transformation is deterministic, it belongs in a collector, a rule, or an insight.

### Architecture

```
Collectors (I/O, deterministic) → Enrichers (probabilistic) → Rules (pure, deterministic) → Findings
```

### How the contradiction is resolved

When a rule consumes facts that came from an enricher, the Kernel marks the resulting finding with `requiresVerification: true`. This is **probabilistic contamination**: the finding carries the uncertainty of its source.

The rule remains pure and deterministic. The finding is explicitly flagged as needing human review. The system does not pretend the finding is trustworthy.

### Consequences for findings

| Property | Deterministic finding | Probabilistic finding |
|---|---|---|
| **Source** | Facts from collectors only | Facts from enrichers (directly or mixed) |
| **Badge** | None | `[Verify]` in CLI output |
| **`requiresVerification`** | `false` / absent | `true` |
| **Breaks strict build?** | When visible in strict mode | Not on its own; a resolved fingerprint that returns fails as a regression even pending verification |
| **Goes to ledger?** | Yes | **Yes** (as `finding.unverified` via `maat check --ledger`) |
| **Can be baselined?** | Yes | Only after human verification |

### Human-in-the-loop verification

Findings with `requiresVerification: true` are presented to the user with a `[Verify]` badge. They do not fail strict mode on their own. A resolved fingerprint that reappears is a regression and fails the command even while awaiting verification, regardless of strict mode. When `maat check --ledger` is used, they are written to the ledger as `finding.unverified`.

A human can run:

```bash
maat verify --fingerprint <fp>
```

**Current implementation limitation (2026-11-13):** `maat verify` records human acceptance as `finding.observed`. In the current implementation, later scans still carry `requiresVerification` when the kernel produces enriched findings; `check` does not clear the flag based on that ledger event. Verification alone therefore does not remove the `[Verify]` badge or make these findings fail strict mode. Returning resolved fingerprints still fail as regressions. The intended promotion to build-blocking findings is not implemented by the current check. Observed records can be baselined; human acceptance does not make the model deterministic.

If a human decides the finding is a false positive, they can dismiss it:

```bash
maat verify --fingerprint <fp> --revoke
```

This appends a `finding.revoked` event. The finding is suppressed — hidden from output on subsequent runs.

## Consequences

- Rules remain pure and deterministic. The `Rule` interface does not change.
- Collectors remain deterministic. The `Collector` interface does not change.
- A new `Enricher` interface is added to `@maat-tools/contracts`.
- The Kernel gains a new execution phase: collectors run in parallel, then enrichers run in parallel, then rules run in parallel. Enrichers receive the same snapshot of collected facts; they cannot depend on facts produced by other enrichers.
- The CLI gains a new command: `maat verify`.
- The ledger gains two new event types: `finding.unverified` and `finding.revoked`. Verification reuses the existing `finding.observed` event type — it promotes a `finding.unverified` record to `finding.observed`.
- `Finding` gains a new field: `requiresVerification?: boolean`.
- `FindingRecord` gains a new field: `verified: boolean`.
- ADR-006 and ADR-007 remain valid. The LLM boundary is still at the collector/enricher layer, never inside rules. What changed is the explicit acknowledgment that probabilistic findings exist and need containment.
- The maat philosophy is not contradicted: **rules are still deterministic**. The probabilistic nature is contained in the *facts*, and the system marks the *findings* that depend on them.

## Rejected alternatives

1. **Put LLM inside the rule**: Violates ADR-006. `evaluate()` must remain pure.
2. **Put deterministic transformation inside enricher**: Redundant. If deterministic, it belongs in a collector or rule.
3. **Auto-approve probabilistic findings after N runs**: Defeats the purpose. The human must explicitly approve.
4. **Store verification in a separate file instead of the ledger**: Fragmentation. The ledger is the single source of truth for all finding lifecycle events.

## Related

- ADR-006: Pure kernel with no I/O
- ADR-007: Determinism is a contract for third-party plugins
