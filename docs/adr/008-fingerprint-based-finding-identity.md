# ADR-008: Fingerprint-based finding identity with stable stringify

**Status:** Accepted  
**Date:** 2026-05-12

## Context

Each finding needs a stable, reproducible identifier (fingerprint) so the ledger can track it across runs. The fingerprint must be the same when the same architectural fact is detected again, and different when the fact changes.

Line numbers, columns, and volatile fields change when unrelated edits shift code around. If those fields participate in the fingerprint, every edit creates a "new" finding and loses the decision history of the old one.

## Decision

Finding fingerprints are SHA-256 hashes of `ruleId` plus `ruleIdentifier`, serialized with a custom stable stringify:

```ts
stableStringify({ ruleId, data: ruleIdentifier })
```

The stable stringify guarantees deterministic output regardless of property insertion order:

- Object keys are sorted alphabetically before serialization
- Arrays preserve element order (they represent ordered data)
- Primitives use `JSON.stringify`

The kernel assigns the fingerprint; rules do not.

### What belongs in `ruleIdentifier`

`ruleIdentifier` should contain the durable facts that make a finding the same finding across runs:

| Good | Bad |
|---|---|
| Package name | Line number |
| Import specifier | Column offset |
| Route path | Timestamp |
| Exported symbol | Absolute temp path |
| Project-relative file path (when location is the fact) | Formatted message |
| Architectural scope | Object dumps from tools without stable shape |

If a rule changes its `ruleIdentifier` inputs between releases, existing ledger decisions may no longer match future findings.

### Array order matters

The stable stringify preserves array element order. If a collector reads files or facts in nondeterministic order, it must sort them before returning facts or before including them in `ruleIdentifier`.

## Consequences

- Renaming a file produces a new fingerprint if the file path is part of the `ruleIdentifier`. This is intentional: the old finding can later be resolved, and the new one starts fresh.
- `describeArtifact()` is separate from fingerprinting. Use it for display fields, not identity.
- Two runs on the same codebase produce identical fingerprints, which is the foundation of the determinism guarantee.
