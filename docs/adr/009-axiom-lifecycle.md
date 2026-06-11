# ADR-009: Axiom lifecycle with explicit termination

**Status:** Accepted  
**Date:** 2026-05-12

## Context

Some project rules cannot be verified by automated detection — for example, "all public APIs must have documentation" or "no circular dependencies between services X and Y". These need to be recorded as manual claims, but they are fundamentally different from findings:

- They do not originate from a detector
- They do not have a fingerprint
- They cannot be "resolved" in the same way a finding can
- They may be replaced by a more specific claim, or withdrawn entirely

A simple boolean "active" flag loses the history of why an axiom was replaced or revoked.

## Decision

Axioms are a separate entity from findings with their own three-event lifecycle:

| Event | Meaning |
|---|---|
| `axiom.declared` | A new manual claim is recorded |
| `axiom.superseded` | The axiom was replaced by a newer version |
| `axiom.revoked` | The axiom was withdrawn entirely |

Both `superseded` and `revoked` set `active: false` on the axiom record. The difference is semantic: `superseded` implies a replacement exists, `revoked` implies the claim is no longer valid.

### Axiom structure

```ts
{
  axiomId: string;          // stable identifier
  scope: string;             // what area of the codebase this covers
  claim: string;             // the manual assertion
  note?: string;             // optional context
  fingerprints?: string[];   // optional finding fingerprints this axiom covers
  active: boolean;           // true only for declared axioms
}
```

An axiom may optionally reference finding fingerprints via `fingerprints`, allowing it to suppress specific findings while the claim is active.

### Fold behavior

- `axiom.declared` creates or updates the axiom record with `active: true`
- `axiom.superseded` and `axiom.revoked` set `active: false` on the matching axiom

## Consequences

- Axioms are never in the `FindingStatus` state machine
- The CLI provides separate commands: `maat axiom declare`, `maat axiom supersede`, `maat axiom revoke`
- An axiom's history is fully traceable through the ledger — who declared it, when it was superseded or revoked, and why
- The `active` flag is derived from events, not set directly
