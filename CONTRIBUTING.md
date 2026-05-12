# Contributing to maat

Thank you for your interest in contributing. This document covers how to set up the project, the architectural constraints you must respect, and the process for submitting changes.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- Node.js ≥ 20 (for tooling compatibility)
- Git

## Setup

```bash
git clone https://github.com/maat-tools/maat
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

## Ledger

One file travels with the repository and must be committed:

- **`maat-ledger.ndjson`** — the append-only event log. Every finding lifecycle event, axiom declaration, and architectural decision is recorded here. Never edit or delete lines.

If you run any `maat` command that mutates the ledger, this file will be updated. Stage it in your commit.

## Architectural constraints

These are non-negotiable. PRs that violate them will not be merged regardless of other merit.

### 1. `Rule.evaluate()` must be pure and synchronous

`evaluate(facts)` is a pure function: same inputs, same outputs, every time. No I/O, no network calls, no randomness, no LLM calls. See [ADR-006](docs/adr/006-pure-kernel.md) and [ADR-007](docs/adr/007-plugin-determinism-contract.md).

### 2. The kernel never touches an LLM

LLMs may produce facts inside a `Collector` (with a committable cache keyed by content hash × model version × prompt version). The kernel and rules never call an LLM. This boundary is inviolable.

### 3. Ledger events are immutable and additive

Never modify or delete a ledger event type's existing fields. New optional fields may be added. Breaking schema changes require a new event type. See [ADR-003](docs/adr/003-event-sourced-ndjson-ledger.md).

### 4. `@maat-tools/contracts` is the only universal import

Packages may import from `@maat-tools/contracts` freely. All other cross-package imports must follow the dependency direction: `cli → kernel → contracts`, `rules → vocabulary → contracts`.

### 5. Finding fingerprints must be stable

The `ruleIdentifier` passed to `generateFingerprint()` must contain only durable facts about the architectural finding. Line numbers, columns, timestamps, and formatted messages are not allowed. See [ADR-008](docs/adr/008-fingerprint-based-finding-identity.md).

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

## Decision-making

Architectural decisions are recorded as axioms in `maat-ledger.ndjson`. Run `maat visualize` to review current decisions before opening a significant PR.

Changes that affect the following areas require a GitHub issue for discussion **before** a PR is opened:

- `@maat-tools/kernel` or `@maat-tools/contracts` (the pure core)
- Public APIs of any published package
- The ledger event schema
- Collector or rule interfaces in `@maat-tools/vocabulary`

For rule packs, collectors, CLI UX, and documentation, a PR with a clear description is sufficient. The maintainer has final say on merges.

## Questions

Open a [GitHub Discussion](https://github.com/maat-tools/maat/discussions) for questions about design or usage. Use [Issues](https://github.com/maat-tools/maat/issues) for bugs and feature requests.
