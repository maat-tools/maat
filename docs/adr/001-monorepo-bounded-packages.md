# ADR-001: Monorepo with bounded packages

**Status:** Accepted  
**Date:** 2026-05-12

## Context

maat covers multiple concerns — parsing source code, evaluating rules, persisting state, exposing a CLI, and defining shared contracts. These concerns have different stability profiles and different extension points. Keeping them in a single package would tangle consumers that need only part of the system, and would make future independent publishing impossible.

## Decision

The codebase is organized as a monorepo. Each package owns a single bounded concern and declares only the dependencies it needs. New packages are added when a concern cannot fit cleanly into an existing one.

## Consequences

- `@maat-tools/contracts` is the only shared leaf all packages may import freely. Everything else follows a strict dependency direction: `cli → kernel → contracts`, `rules → vocabulary → contracts`.
- Publishing individual packages to npm is straightforward when the time comes.
- The package list will grow and change — see the `packages/` directory for the current state.
