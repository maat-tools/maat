# ADR-010: Determinism is a contract, not a guarantee, for third-party plugins

**Status:** Accepted  
**Date:** 2026-05-05

## Context

maat's core value proposition rests on a deterministic kernel: given the same codebase state, it always produces the same findings. This is what makes the ledger trustworthy — an attributed decision is only meaningful if it was produced by a system that would make the same decision again on the same inputs.

Within the maat monorepo this is enforced by design: `Rule.evaluate()` is synchronous, `Insight.analyze()` is synchronous, the kernel has no I/O, and LLMs are explicitly excluded from the evaluation path (see ADR-006).

However, maat is an open plugin system. Third-party packages can implement `Collector`, `Rule`, and `Insight`. The TypeScript type system cannot encode purity — nothing in the `Rule` interface prevents a plugin author from making a network call, reading a file, or invoking an LLM inside `evaluate()`.

## Decision

Determinism for third-party plugins is a **documented contract**, not a runtime guarantee enforced by maat's kernel.

### The contract

Any package implementing `Rule`, `Collector`, or `Insight` for use with maat must honor the following:

- **`Rule.evaluate(facts)`** — must be synchronous and pure: same inputs always produce same outputs. No I/O, no network, no randomness, no LLM calls.
- **`Insight.analyze(findings)`** — same constraints as `evaluate`.
- **`Collector.collect()`** — may be async and may perform I/O (that is its purpose), but must be deterministic for a given filesystem/environment state. If a collector uses an LLM, it must maintain a committable cache keyed by content hash × model version × prompt version, so repeated runs on identical inputs produce identical facts.

### Enforcement path (progressive)

| Phase | Mechanism |
|---|---|
| Now | Documented contract in plugin authoring guide. Violation is a social/community concern. |
| V1+ | `@maat/rule-tester` ships a determinism assertion: runs `evaluate()` twice with identical inputs and asserts deep equality of output. Plugin CI is expected to include this check. |
| Future | Worker-based plugin isolation with restricted permissions (no network, no FS writes). Bun and Deno both support permission-scoped subprocesses. This is the hard enforcement boundary — post-V1. |

## Consequences

- maat's README and plugin authoring documentation must state explicitly: *"maat's kernel is deterministic. Third-party plugins are outside that guarantee and must honor the purity contract."*
- The `@maat/rule-tester` package is a planned V1+ deliverable, not optional.
- A plugin that violates the contract corrupts the ledger for users of that plugin. maat cannot detect this at runtime in V1. This is an accepted risk at the current scale.
- The LLM-inside-collector pattern (caching + deterministic output) is the only sanctioned path for AI-assisted fact collection. LLMs inside `evaluate()` or `analyze()` are a hard violation regardless of caching.
