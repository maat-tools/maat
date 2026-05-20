# Determinism

Maat is designed for reproducible architecture checks. A finding is useful only when the same repository state can produce it again.

## Official rule guarantee

Rules shipped from the official `maat-tools/maat` repository are deterministic by guarantee.

For the same rule version and the same collected facts, official Maat rules produce the same findings:

- no hidden state
- no randomness
- no network calls
- no filesystem reads during rule evaluation
- no LLM judgment in the check path

Official rules evaluate facts already collected by collectors. They do not inspect the repository directly, call external services, or make time-dependent decisions.

## Enrichers and probabilistic facts

Enrichers are a plugin type that consumes facts and produces new facts through interpretation, synthesis, or inference — typically using an LLM. **All enrichers are probabilistic by design.**

This does not break the rule guarantee. Rules remain deterministic:

- `Rule.evaluate(facts)` is still a synchronous pure function.
- Rules do not call LLMs or make network requests.

When a rule consumes facts produced by an enricher, the resulting finding is marked with `requiresVerification: true`. These findings:

- display a `[Verify]` badge in CLI output;
- never break strict builds;
- never go to the ledger;
- can only be treated as deterministic after human verification with `maat verify`.

The non-determinism is explicitly contained at the **fact layer**, not the rule layer. See the [Enrichers guide](/guide/enrichers) and [ADR-011](/adr/011-enrichers-probabilistic-facts) for the full design.

## Third-party packages

Third-party collectors, rules, insights, and ledger backends are outside the official guarantee.

Maat supports third-party packages through public interfaces, but it cannot prove at runtime that external package code is pure, deterministic, or safe. If you install a third-party Maat package, you are responsible for deciding whether that package is acceptable for your repository and CI environment.

Third-party package authors are expected to follow the plugin determinism contract:

- `Rule.evaluate(facts)` must be synchronous and pure.
- `Insight.analyze(findings)` must be synchronous and pure.
- `Collector.collect()` may perform I/O, but must produce deterministic facts for the same filesystem and environment state.
- LLM-assisted collectors must use a committed or otherwise reproducible cache keyed by content hash, model version, and prompt version.
- LLM calls inside `Rule.evaluate()` or `Insight.analyze()` violate the contract.

## Ledger history

Official ledger backends preserve append-only history. The current file ledger writes NDJSON events by appending lines and derives current state by replaying those events.

The generated ledger file can be committed to version control so accepted findings, resolved findings, and axioms travel with the repository. This is part of the reproducibility model: a future run can compare current findings with the recorded history.

Maat does not bind a finding or ledger event to a user identity. Decisions such as baselining or resolving findings still need a responsible decision maker, but that ownership should come from the normal repository workflow: commits, reviews, and change history. This keeps Maat independent from Git hosting providers, identity systems, and external approval flows.

Third-party ledger backends must preserve the same event-log semantics, but the TypeScript interface cannot enforce that by itself.

## Why this matters

The ledger records decisions about findings. If a finding is not reproducible, the recorded decision becomes weak: a future run may not be able to explain or resolve the same architectural fact.

Use official rules when you need the project-level determinism guarantee. Use third-party packages when you accept responsibility for their behavior.

See [ADR-007: Plugin determinism contract](/adr/007-plugin-determinism-contract) for the architectural decision behind this policy.
