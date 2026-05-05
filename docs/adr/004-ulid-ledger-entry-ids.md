# ADR-004: ULID for ledger entry identifiers

**Status:** Accepted  
**Date:** 2026-04-17

## Context

Every ledger event needs a globally unique identifier (`entry_id`) that:

1. Does not require a central authority or database sequence.
2. Is sortable by creation time without a separate timestamp sort.
3. Is URL-safe and copy-paste friendly.
4. Works offline and in CI environments with no network access.

## Decision

Ledger entries use ULID (Universally Unique Lexicographically Sortable Identifier). A ULID is a 26-character string encoding a 48-bit millisecond timestamp and 80 bits of randomness.

```
entry_id: "01HZ4QK7BRXF3S2EGVN1V4PXWZ"
```

ULIDs are generated at write time in the `FilePathLedgerBackend.append()` method. The caller supplies the event payload without `entry_id`; the backend assigns it.

**Why not UUID v4:** UUIDs are not sortable. Ledger entries should be queryable in insertion order without a separate sequence column or sort key.

**Why not UUID v7:** ULID has wider ecosystem support in the JavaScript community at the time of adoption, and the `ulid` package is minimal with no dependencies.

## Consequences

- `entry_id` is always monotonically increasing within a single process. Across concurrent processes writing to the same file, ordering within the same millisecond is random (80-bit entropy collision probability is negligible).
- The `entry_id` is assigned by the backend, not the caller. This means the caller cannot predict the `entry_id` before writing — callers that need the ID must read it back or use the timestamp field.
- Sorting the ledger file lexicographically by `entry_id` produces chronological order.
