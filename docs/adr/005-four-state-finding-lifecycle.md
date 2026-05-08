# ADR-005: Four-state finding lifecycle plus axiom

**Status:** Accepted  
**Date:** 2026-04-17

## Context

Most check tools treat findings as binary: pass or fail. maat needs to distinguish four states:

1. "I haven't looked at this yet." — default detector output  
2. "I looked at it and accept it as it is." — baseline
3. "I looked at it and want to track it." — promoted
4. "I looked at it and this must never regress." — enforced gate

Some project rules cannot be detected by an automated check yet. These need to be recorded too, but they do not originate from a finding.

## Decision

Findings move through a linear state machine:

```
observed → promoted → enforced
```

Additionally, a finding can be **baselined** (a flag, not a state): it was present on the first run and accepted as the starting point. Baselined observations are suppressed in `maat check` output unless explicitly requested.

**Axioms** are manual claims with no corresponding detector. They are persisted in the same ledger via `axiom.declared` events but are never in the `FindingState` state machine.

| State/Flag | Type | Source |
|---|---|---|
| `observed` | FindingState | Detector output, not yet reviewed |
| `observed` + `baselined: true` | FindingState + flag | First-run baseline acceptance |
| `promoted` | FindingState | Reviewed finding |
| `enforced` | FindingState | Finding enforced by CI |
| `axiom` | Separate entity | Manual claim, not tool-verifiable |

State transitions are strictly forward. There is no mechanism to demote `promoted` back to `observation` — the history is immutable. If a promoted finding is revoked, a new event type (`finding.revoked`, not in V1) would record that.

## Consequences

- The `FindingState` union is `'observation' | 'promoted' | 'enforced'`. No other values are valid.
- CLI exit codes map to states: `0` = clean, `1` = enforced finding violation, `2` = tool error.
- The ledger fold function reconstructs the current state of each finding from events. A finding with only `finding.observed` is in state `observed`.
- Axioms are folded separately from findings. The `FindingRecord` type does not represent axioms.
