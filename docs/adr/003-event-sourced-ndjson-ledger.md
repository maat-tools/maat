# ADR-003: Event-sourced append-only ledger in NDJSON

**Status:** Accepted  
**Date:** 2026-04-17

## Context

maat stores finding history, not only current finding state. Decisions such as baselining or resolving a finding need a responsible decision maker, but the ledger should not couple findings to an identity provider, Git host, or external approval system. A mutable store (database, JSON file rewritten on every run) loses review context and creates unnecessary merge conflicts in version control.

## Decision

The ledger is an append-only log of typed events serialized as Newline-Delimited JSON (NDJSON). Each line is one complete JSON object. Nothing is ever updated or deleted.

Current event types:

| Event | Meaning |
|---|---|
| `finding.observed` | Detector produced a new finding |
| `finding.baselined` | Human accepted a finding as part of the current baseline |
| `finding.resolved` | User confirmed an exact finding fingerprint was fixed |
| `axiom.declared` | User added a manual claim the tool cannot verify |

The current state of any finding is derived by replaying events in order (the fold pattern). The ledger file is a valid append target from multiple sequential runs with no coordination required.

**Why NDJSON over a database or structured log:**

- NDJSON is human-readable in any text editor or `git log`.
- It diffs cleanly in version control — each run appends lines, no rewrite conflicts.
- It requires zero infrastructure: no server, no migration, no connection string.
- The format is unambiguous for tooling: `jq`, `grep`, `wc -l` all work directly.
- Decision ownership stays in the repository workflow: the committed ledger diff, commit author, review, and surrounding change history.

## Consequences

- The ledger file grows monotonically. It is never compacted or rewritten in V1.
- The fold function (`readAll → fold`) must be efficient enough for the typical ledger size. For large codebases with long histories, a checkpoint mechanism may be introduced in a future version if needed.
- Ledger files should be committed to version control alongside the codebase. The ledger is source data, not build output.
- Ledger events are not bound to actors by Maat. Event timestamps support ordering, while ownership comes from the version-control history of the ledger file.
- Changing the schema of an existing event type is not allowed. New fields may be added (additive only). Breaking changes require a new event type.
