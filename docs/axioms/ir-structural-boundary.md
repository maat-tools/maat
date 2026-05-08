# IR Structural Boundary (Axiom)

> **Status: pending enforcement** — This axiom should be checked by maat once the rule authoring DSL supports it. Until then it is a manual invariant.

The Intermediate Representation (IR) is the shared data format between collectors and rules.

## The Core Boundary

> **The IR describes structure. Rules describe problems.**

An IR field is valid if it answers: *"what is this thing and where does it sit in the code?"*

An IR field has crossed the boundary if it answers: *"is this a problem?"*

| Field | Valid? | Reason |
|---|---|---|
| `context: 'argument'` | ✓ | Structural/syntactic fact |
| `location: { file, line, column }` | ✓ | Structural/syntactic fact |
| `isSharedAcrossModules: true` | ✗ | Coupling judgment — that's the rule's job |
| `isSuspicious: true` | ✗ | Coupling judgment — that's the rule's job |

## Capability Strategy

### Universal capabilities
Concepts that exist in every language, expressed in a language-neutral IR. One rule covers all languages.

Examples: `literals`, `imports`, `http-calls`, `function-calls`, `event-messages`

### Language-specific capabilities
Concepts with no universal equivalent. Namespaced by language (`ts:decorators`, `java:annotations`). Only the matching collector provides them; rules that `need` them are silently skipped on other languages.

This row should be rare. Before creating a language-specific capability, ask: *can the collector normalize this into an existing universal concept?* (e.g. Go channels → `event-messages`)

| Scenario | Approach |
|---|---|
| Universal concept (literals, HTTP calls) | Universal IR + one universal rule |
| Language syntax that maps to a universal concept (Go channels → event messages) | Collector normalizes into universal IR, same universal rule applies |
| Concept with no universal equivalent (TS decorators) | Language-specific capability + language-specific rule |

## IR Evolution

The IR will grow over time as rules expose gaps. This is expected. The discipline is:

1. A rule needs nuanced judgment → ask "does the IR carry enough context?"
2. If no → add a field to the IR, have the collector populate it
3. Validate the new field against the boundary test above

Watch for **IR creep**: fields accumulating until the collector is doing rule work under a different name. The boundary test is the guard.

## Verifying the Boundary

When the tooling is mature enough, add a rule that validates collector output against structural-only conventions.
