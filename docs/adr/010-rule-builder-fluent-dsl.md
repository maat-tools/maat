# ADR-010: Rule builder for fluent DSL-style configuration

**Status:** Accepted  
**Date:** 2026-05-12

## Context

Most rules are configured via `defineRule()` with an options object. This works well for simple configuration but becomes awkward for rules that need a multi-step, interdependent setup.

The layer rule (`layer('target').is(Pure).allows('a', 'b')`) is the primary example. It needs:
1. A target to define the boundary
2. A role to determine what kind of isolation applies
3. A set of allowed exceptions

Expressing this as a flat options object loses the natural flow and makes invalid configurations possible (e.g., a layer without a role).

## Decision

`RuleBuilder` is a second extension point alongside `Rule` and `RuleFactory`:

```ts
export interface RuleBuilder {
  build(): Rule;
}
```

The CLI recognizes `RuleBuilder` instances in the rules array and calls `.build()` to produce the final `Rule` before registration:

```ts
if (isRuleBuilder(ruleEntry)) {
  this.kernel.registerRule(ruleEntry.build());
}
```

The `defineRuleBuilder()` helper brands the builder so the CLI can distinguish it from plain objects.

### Builder interface

The builder is free to expose any fluent or chained API. The only requirement is that `build()` returns a valid `Rule`. The layer rule uses a two-phase builder:

```ts
layer('target').is(Pure).allows('a', 'b')
//     ↑              ↑           ↑
//   target         role       allowed
```

This prevents invalid configurations — a layer must have a role before it can be built.

## Consequences

- `RuleBuilder` is for rules that benefit from a DSL-like syntax. Most rules should still use `defineRule()` with options.
- The builder is resolved at config time, not at runtime. The resulting `Rule` is what the kernel executes.
- Third-party plugin authors can use `defineRuleBuilder()` if their rule has complex configuration needs.
- The builder pattern is additive — it doesn't replace `defineRule()` or `defineRuleSet()`.
