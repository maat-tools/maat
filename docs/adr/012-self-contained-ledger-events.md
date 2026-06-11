# ADR-012: Self-contained ledger events

**Status:** Accepted  
**Date:** 2026-06-11

## Context

The original ledger design (ADR-003, ADR-005) stored delta events: `finding.baselined` carried only a fingerprint and expiry, `finding.resolved` only a fingerprint. The fold reconstructed an aggregate record (`FindingRecord`/`AxiomRecord`) with derived fields (`state`, `baselined`, `active`) that existed nowhere on disk.

This created two parallel type vocabularies — events on disk, records in memory — and constant conversion between them. The fold embedded state-transition logic (e.g. resolved findings transitioning back to observed on re-observation), and the divergence between persisted shape and application shape was a recurring source of bugs.

## Decision

Every ledger event is self-contained: it carries the full finding or axiom record at the moment it was written.

- Finding events (`finding.observed`, `finding.baselined`, `finding.resolved`, `finding.unverified`, `finding.revoked`) all carry `fingerprint`, `ruleId`, `instanceId`, `message`, and `artifacts`, plus event-specific fields (`expiresAt` on baseline, `reason` where applicable).
- Axiom events (`axiom.declared`, `axiom.superseded`, `axiom.revoked`) all carry `axiomId`, `scope`, `claim`, and optional `note`/`fingerprints`.
- The snapshot stores the latest event per fingerprint/axiomId. The fold is pure last-write-wins; it contains no business logic.
- State transitions are decided by the writer: a CLI command reads the current (latest) event and appends the full record in its new state, copying fields forward.
- There are no derived record types. The same event types describe data on disk, in the snapshot cache, and in the application. Consumers narrow by the `type` discriminator.

This supersedes ADR-005's "baseline is a flag, not a state": `finding.baselined` is now a state in the finding lifecycle — a finding is baselined when its latest event has that type and the expiry has not passed.

Field names use camelCase (`entryId`, `runId`, `ruleId`, `expiresAt`), matching the application vocabulary.

## Consequences

- Zero conversion between persistence and application; one type vocabulary end to end.
- The fold cannot hide decisions: anything that changes state is an explicit, reviewable append by a writer.
- Ledger lines are larger, since transition events repeat the full record. Each line is self-sufficient and human-readable in isolation.
- Re-baselining an expired baseline appends a new `finding.baselined` event; the history of deferrals stays visible in the log.
- A finding that disappears from the codebase while baselined stays `finding.baselined` until expiry, then surfaces as an expired baseline (same behavior as before; a future refinement may auto-resolve it).
- Existing 0.1 ledgers written in the delta format are incompatible; no on-read migration is provided (per the determinism contract). The dogfooding ledger was rewritten once, preserving original entry IDs and timestamps.
