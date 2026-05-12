# ADR-006: Pure kernel with no I/O

**Status:** Accepted  
**Date:** 2026-05-12

## Context

The kernel is the component that orchestrates fact collection, rule evaluation, and insight analysis. If the kernel or the rules it runs have side effects — file I/O, network calls, random values, LLM calls — then:

- Determinism is broken: two runs on the same inputs can produce different outputs.
- Testing requires mocking infrastructure.
- The ledger's integrity guarantees are weakened.

## Decision

The kernel and all rules it runs are pure: given the same inputs, they always produce the same outputs with no observable side effects.

**Kernel (`@maat-tools/kernel`):**
- `Kernel.run()` is an orchestrator, not a judge. It collects facts, dispatches to rules, and returns the combined findings. Insights are called by the CLI, not the kernel.
- The kernel does not write to the ledger, does not make network calls, and does not invoke LLMs.
- Collectors may be async (they read files from disk) but their results are deterministic for a given filesystem state.
- The kernel uses `console.warn` for operational diagnostics (missing collectors/rules, skipped rules). This is the only side effect and does not affect output determinism.

**Rules (`Rule.evaluate()`):**
- `evaluate(facts)` is a synchronous pure function: `Facts → Finding[]`.
- No I/O. No randomness. No external calls.
- All filtering, thresholds, and logic live inside `evaluate`.

**LLM boundary:**
- LLMs may produce facts *inside a collector* (e.g., a future prose-analysis collector). The collector is responsible for determinism via a committable cache keyed by content hash × model × prompt version.
- The kernel and rules never call an LLM. This boundary is required for reproducible findings.

## Consequences

- Rule unit tests require no mocking infrastructure: pass a `facts` object, assert on `Finding[]`.
- The kernel's `run()` is easily testable by injecting stub collectors.
- Collectors are the only I/O boundary. Their output is the fact base; everything downstream is pure.
- Adding an LLM call inside a rule is a hard violation of this ADR, regardless of UX pressure or performance arguments.
