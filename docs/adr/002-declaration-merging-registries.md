# ADR-002: Declaration-merging registries for type-safe extensibility

**Status:** Accepted  
**Date:** 2026-05-12

## Context

maat needs to be extended by external packages — third-party collectors, rules, ledger backends, and insights — without requiring changes to the core. At the same time, the config and kernel must be fully type-safe: a config entry `['@maat-tools/collector-ts', options]` should only accept options that `@maat-tools/collector-ts` actually accepts.

Module augmentation (declaration merging) is a TypeScript-native pattern where an external package extends an interface defined in another package. It requires no runtime registry, no dynamic type generation, and no code generation step.

## Decision

`@maat-tools/contracts` defines five empty interfaces that serve as extensible registries:

```ts
export interface FactRegistry {}       // key → fact type
export interface CollectorRegistry {}  // collector id → config type
export interface RuleRegistry {}       // rule id → options type
export interface LedgerBackendRegistry {} // backend id → config type
export interface InsightRegistry {}    // insight id → options type
```

Each package that contributes a capability augments the relevant registry:

```ts
// In @maat-tools/vocabulary:
declare module '@maat-tools/contracts' {
  interface FactRegistry {
    constants: Constant[];
  }
}
```

The `defineCollector`, `defineRule`, `defineRuleSet`, `defineRuleBuilder`, `defineInsight`, `defineInsightSet`, and `defineLedgerBackend` helpers in `@maat-tools/contracts` return branded factories or sets. The branded factory helpers preserve the config and option types that augmenting packages register. The config types in `@maat-tools/core` use mapped types over the collector, rule, and ledger backend registries to produce precise option types; `FactRegistry` types the fact exchange between collectors and rules, and `InsightRegistry` is the corresponding declaration-merging extension point for insight options.

## Consequences

- Adding a new capability is purely additive: implement the interface, augment the registry, export a branded factory. Zero changes to `@maat-tools/contracts`.
- The config type for `defineConfig` is automatically updated when a package is installed and imported.
- Packages that are never imported do not pollute the registry.
- The pattern requires that augmenting packages are actually imported somewhere in the consumer's type-checking scope. The CLI's `import()` dynamic loading satisfies this at runtime but not at compile time for external packages not listed in `tsconfig`. This is an accepted tradeoff.
