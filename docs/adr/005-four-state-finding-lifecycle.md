# ADR-005: Finding lifecycle plus axiom

**Status:** Superseded by [ADR-012](012-self-contained-ledger-events.md)  
**Date:** 2026-05-12

> **Note (2026-06-11):** the "baseline is a flag, not a state" decision no longer holds. Ledger events are now self-contained and the latest event per fingerprint is the current state, which makes `finding.baselined` a state in the finding lifecycle. The corresponding axiom `finding-lifecycle-states` was superseded by `ledger-self-contained-events` in the ledger.

## Context

Most check tools treat findings as binary: pass or fail. maat needs to distinguish a small set of decisions about a finding fingerprint:

1. "I haven't looked at this yet." — default detector output  
2. "I looked at it and accept it as it is." — baseline
3. "This exact finding was fixed." — resolved

Some project rules cannot be detected by an automated check yet. These need to be recorded too, but they do not originate from a finding.

## Decision

Findings move through a small state machine:

```
observed → resolved
```

Additionally, a finding can be **baselined** (a flag, not a state): it was present on the first run and accepted as the starting point. Baselined observations are suppressed in `maat check` output unless explicitly requested.

When a finding disappears from the codebase between runs, it is **auto-resolved**. If a previously resolved finding reappears with the same fingerprint, it transitions back to `observed`.

**Axioms** are manual claims with no corresponding detector. They are persisted in the same ledger via axiom events but are never in the `FindingStatus` state machine.

| State/Flag | Type | Source |
|---|---|---|
| `observed` | FindingStatus | Detector output, not yet reviewed |
| `observed` + `baselined: true` | FindingStatus + flag | First-run baseline acceptance |
| `resolved` | FindingStatus | Exact fingerprint was fixed, or auto-resolved when finding disappeared |
| `axiom` | Separate entity | Manual claim, not tool-verifiable |

Axiom events:

| Event | Meaning |
|---|---|
| `axiom.declared` | User added a manual claim |
| `axiom.superseded` | Axiom was replaced by a newer version |
| `axiom.revoked` | Axiom was withdrawn entirely |

Resolution is fingerprint-specific. If another finding from the same rule appears with a different fingerprint, it is a new finding, not a regression of the resolved one.

## Consequences

- The finding status union is `finding.observed | finding.resolved`. Baseline is a flag on the finding record.
- CLI exit codes map to checks: `0` = clean, `1` = visible finding under strict mode, exact resolved fingerprint regression, or expired baseline, `2` = tool error.
- The ledger fold function reconstructs the current state of each finding from events. A finding with only `finding.observed` is in state `observed`.
- Axioms are folded separately from findings. The `FindingRecord` type does not represent axioms.
