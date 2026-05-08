# ADR-003: Event-sourced append-only ledger in NDJSON

**Status:** Accepted  
**Date:** 2026-04-17

## Context

maat stores finding history, not only current finding state. Each state transition needs an author and timestamp. A mutable store (database, JSON file rewritten on every run) loses this history and creates unnecessary merge conflicts in version control.

## Decision

The ledger is an append-only log of typed events serialized as Newline-Delimited JSON (NDJSON). Each line is one complete JSON object. Nothing is ever updated or deleted.

Current event types:

| Event | Meaning |
|---|---|
| `finding.observed` | Detector produced a new finding |
| `finding.baselined` | Human accepted a finding as part of the current baseline |
| `finding.promoted` | User marked a finding as reviewed |
| `finding.enforced` | User made a finding enforceable by CI |
| `axiom.declared` | User added a manual claim the tool cannot verify |

The current state of any finding is derived by replaying events in order (the fold pattern). The ledger file is a valid append target from multiple sequential runs with no coordination required.

**Why NDJSON over a database or structured log:**

- NDJSON is human-readable in any text editor or `git log`.
- It diffs cleanly in version control — each run appends lines, no rewrite conflicts.
- It requires zero infrastructure: no server, no migration, no connection string.
- The format is unambiguous for tooling: `jq`, `grep`, `wc -l` all work directly.

## Consequences

- The ledger file grows monotonically. It is never compacted or rewritten in V1.
- The fold function (`readAll → fold`) must be efficient enough for the typical ledger size. For large codebases with long histories, a snapshot/checkpoint mechanism may be needed in a future version.
- Ledger files should be committed to version control alongside the codebase. The ledger is source data, not build output.
- Changing the schema of an existing event type is not allowed. New fields may be added (additive only). Breaking changes require a new event type.
