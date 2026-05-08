# ADR-008: Bundled TypeScript parser (ts-morph)

**Status:** Accepted  
**Date:** 2026-04-17

## Context

maat must parse TypeScript source files in target projects it does not control. A naive approach would require the target project to have a compatible `typescript` version installed, resolve types through the target's `node_modules`, or depend on the target's `tsconfig` for compilation settings beyond file discovery.

This creates a fragile coupling: maat breaks when the target upgrades TypeScript, uses unconventional `tsconfig` layouts, or runs in a CI environment where `node_modules` are only partially installed.

## Decision

maat bundles its own TypeScript parser via `ts-morph`. The `@maat-tools/collector-ts` package depends on `ts-morph` directly. The target project's installed `typescript` version is not consulted.

The collector accepts a `tsConfigFilePath` pointing to the target project's `tsconfig.json`. This is used only to discover source files (via `include`/`exclude` patterns) — not to perform type resolution or emit.

`ts-morph` wraps the TypeScript compiler API and provides a higher-level AST traversal interface. It is the only parsing dependency; no separate `@typescript-eslint/parser` or Babel transform is used.

## Consequences

- `@maat-tools/collector-ts` carries its own `typescript` version in `devDependencies`. Running `maat check` on a project using TypeScript 5.8 while maat bundles TypeScript 5.4 is explicitly supported.
- Syntax-level parsing (string literals, numeric literals, identifiers) is stable across TypeScript versions. Type-level analysis (types, generics, inference) is not attempted in V1 and is outside the fact boundary.
- The target project does not need to install maat's TypeScript version. maat does not write to `node_modules` of the target.
- If a future capability requires type resolution (e.g., tracking types across files), that capability must document the TypeScript version dependency explicitly and be opt-in.
