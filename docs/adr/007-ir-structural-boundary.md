# ADR-007: IR describes structure; rules describe problems

**Status:** Accepted  
**Date:** 2026-04-17

## Context

The Intermediate Representation (IR) is the shared vocabulary between collectors and rules. It lives in `@maat/vocabulary`. Its design is the most critical architectural decision in maat because it determines what rules can express and what collectors must compute.

There is a natural pressure for collectors to be "helpful" — to pre-compute coupling signals, flag suspicious patterns, or annotate facts with semantic meaning. This pressure must be resisted.

## Decision

**The IR describes structure. Rules describe problems.**

An IR field is valid if and only if it answers: *"what is this thing and where does it sit in the code?"*

An IR field has crossed the boundary if it answers: *"is this a problem?"*

| Field | Valid? | Reason |
|---|---|---|
| `context: 'argument'` | ✓ | Syntactic role of the node |
| `location: { file, line, column }` | ✓ | Position in source |
| `kind: 'string' \| 'number'` | ✓ | Literal type |
| `value: string` | ✓ | The literal's content |
| `isSharedAcrossModules: true` | ✗ | Coupling judgment — that's the rule's job |
| `isSuspicious: true` | ✗ | Semantic judgment — that's the rule's job |
| `connascenceScore: number` | ✗ | Analysis result — belongs in a finding |

### Capability strategy

**Universal capabilities** — concepts that exist in every language, expressed in a language-neutral IR. One rule covers all languages. Examples: `constants`, `imports`, `http-calls`, `function-calls`, `event-messages`.

**Language-specific capabilities** — concepts with no universal equivalent. Namespaced by language (`ts:decorators`, `java:annotations`). Rules that `need` them are silently skipped on other languages. This should be rare: before creating a language-specific capability, ask whether the collector can normalize it into an existing universal concept (e.g. Go channels → `event-messages`).

### IR evolution

The IR will grow as rules expose gaps. The discipline is:

1. A rule needs richer judgment → ask "does the IR carry enough structural context?"
2. If no → add a structural field to the IR, have the collector populate it.
3. Validate the new field against the boundary test above.

**IR creep warning:** fields accumulating until the collector is performing semantic analysis under a different name. The boundary test is the guard.

## Consequences

- The `Constant` type in `@maat/vocabulary` contains only: `kind`, `value`, `raw`, `context` (syntactic role), and `location`. No semantic flags.
- The `ConnascenceOfMeaningRule` determines whether a value appears in enough distinct files to constitute a finding. That threshold logic is in the rule, not the collector.
- A future linter or automated test should validate that IR fields are structural-only.
