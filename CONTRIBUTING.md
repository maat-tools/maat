# Contributing to maat

Thank you for your interest in contributing. This document covers how to set up the project, the architectural constraints you must respect, and the process for submitting changes.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- Node.js ≥ 20 (for tooling compatibility)
- Git

## Setup

```bash
git clone https://github.com/maatjs/maat
cd maat
bun install
```

Run the full validation suite:

```bash
bun run typecheck   # TypeScript type checking
bun run lint        # Biome lint + format
bun run test        # Unit tests
```

## Project structure

maat is a monorepo. Each package owns a single bounded concern — see [ADR-001](docs/adr/001-monorepo-bounded-packages.md) for the full rationale.

```
packages/
  contracts/       # Shared interfaces and branded factories — the only universal import
  vocabulary/      # Canonical IR types and capability keys
  kernel/          # Orchestration — pure, no I/O
  core/            # Config schema
  collector-ts/    # TypeScript AST walker
  coupling-rules/  # Rule pack
  file-ledger/     # NDJSON ledger backend
  cli/             # Entry point
```

Before adding a new package, it must clearly own a concern not already owned by an existing one.

## Architectural constraints

These are non-negotiable. PRs that violate them will not be merged regardless of other merit.

### 1. `Rule.evaluate()` must be pure and synchronous

`evaluate(facts)` is a pure function: same inputs, same outputs, every time. No I/O, no network calls, no randomness, no LLM calls. See [ADR-006](docs/adr/006-pure-kernel.md) and [ADR-010](docs/adr/010-plugin-determinism-contract.md).

### 2. The kernel never touches an LLM

LLMs may produce facts inside a `Collector` (with a committable cache keyed by content hash × model version × prompt version). The kernel and rules never call an LLM. This boundary is inviolable.

### 3. The IR describes structure, not problems

Fields on IR types in `@maat-tools/vocabulary` must answer "what is this thing and where does it sit?" — not "is this a problem?" Coupling judgments belong in rules. See [ADR-007](docs/adr/007-ir-structural-boundary.md).

### 4. Ledger events are immutable and additive

Never modify or delete a ledger event type's existing fields. New optional fields may be added. Breaking schema changes require a new event type. See [ADR-003](docs/adr/003-event-sourced-ndjson-ledger.md).

### 5. `@maat-tools/contracts` is the only universal import

Packages may import from `@maat-tools/contracts` freely. All other cross-package imports must follow the dependency direction: `cli → kernel → contracts`, `rules → vocabulary → contracts`. Circular dependencies are a build error.

## Contributing a rule or collector

Rules and collectors are the primary extension points. The design targets external packages (`@your-org/maat-rules-*`) that plug in via `maat.config.ts` — the same mechanism maat uses internally.

1. Implement `Rule<TNeeds>` and export a `BrandedRuleFactory` via `defineRule()`.
2. If your rule needs new facts, add a capability to `@maat-tools/vocabulary` (or your own vocabulary package) and implement the corresponding `Collector`.
3. Write unit tests using plain fact objects — no mocking infrastructure needed since `evaluate()` is pure.
4. Once `@maat-tools/rule-tester` ships, include the determinism assertion in your test suite.

## Submitting changes

1. Fork the repository and create a branch from `main`.
2. Make your changes. Keep commits focused — one logical change per commit.
3. Ensure `bun run typecheck && bun run lint && bun run test` all pass.
4. Open a pull request. Fill in the PR template.

## Commit message format

```
<type>(<scope>): <short summary>

Types: feat, fix, refactor, test, docs, chore
Scope: contracts, kernel, cli, collector-ts, coupling-rules, file-ledger, vocabulary, core
```

Example: `feat(coupling-rules): add threshold option to CoM rule`

## Questions

Open a [GitHub Discussion](https://github.com/maatjs/maat/discussions) for questions about design or usage. Use [Issues](https://github.com/maatjs/maat/issues) for bugs and feature requests.
