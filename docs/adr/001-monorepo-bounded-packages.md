# ADR-001: Monorepo with a fixed set of bounded packages

**Status:** Accepted  
**Date:** 2026-04-17

## Context

maat is a multi-concern tool: it parses source code, evaluates rules, persists state, exposes a CLI, and defines shared contracts. These concerns have different stability profiles and different extension points. Keeping them in one package would tangle consumers that need only part of the system, and would make future independent publishing impossible.

## Decision

The codebase is organized as a monorepo with a fixed set of packages, each owning a single bounded concern:

| Package | Concern |
|---|---|
| `@maat-tools/contracts` | Shared TypeScript interfaces and branded factories — the only thing every package can import |
| `@maat-tools/vocabulary` | Canonical IR types and capability keys (what collectors produce, what rules consume) |
| `@maat-tools/kernel` | Orchestrates collectors → facts → rules → findings → insights; no I/O |
| `@maat-tools/core` | Config schema and `defineConfig` helper |
| `@maat-tools/collector-ts` | TypeScript AST walker; emits `constants` facts |
| `@maat-tools/coupling-rules` | Rule pack — Connascence of Meaning and future coupling rules |
| `@maat-tools/file-ledger` | Append-only NDJSON ledger backend |
| `@maat-tools/cli` | Entry point; wires kernel, config, and ledger |

The constraint "roughly seven packages" is intentional. Before adding a package, the proposal must name which concern it owns that is not already owned.

## Consequences

- Each package has a `package.json` with its own dependency list. A collector does not pull in CLI deps.
- `@maat-tools/contracts` is the only shared leaf all packages may import freely. Everything else follows a strict dependency direction: `cli → kernel → contracts`, `rules → vocabulary → contracts`.
- Publishing individual packages to npm is straightforward when the time comes.
- Circular dependencies between packages are a build error by design.
