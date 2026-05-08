# Changelog

All notable changes to maat will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). maat uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] — 2026-05-08

First public development release. APIs are not yet stable.

### Added
- Monorepo structure: `@maat-tools/contracts`, `@maat-tools/vocabulary`, `@maat-tools/kernel`, `@maat-tools/core`, `@maat-tools/collector-ts`, `@maat-tools/coupling-rules`, `@maat-tools/connascence-rules`, `@maat-tools/file-ledger`, `@maat-tools/cli`
- TypeScript AST collector (`@maat-tools/collector-ts`) — walks imports and builds the IR
- Connascence of Meaning rule (CoM) as the first shipped rule pack
- Coupling layer rules (`layer().is().allows()`) for explicit dependency allowlists
- Append-only NDJSON ledger backend (`@maat-tools/file-ledger`)
- `maat check` — scan for architectural findings; `--ledger` to sync with ledger, `check.strict` to fail on any finding
- `maat axiom declare/supersede/revoke` — record human-authored architectural claims in the ledger
- `maat baseline` — accept current findings as the starting point, suppressing them from future output
- `maat promote` — promote an observed finding to acknowledged, optionally escalating to an enforced CI gate
- `maat resolve` — confirm intentional resolution of a previously promoted or enforced finding
- `maat visualize` — display current state of findings, axioms, and insights from the ledger
- `maat.config.ts` plugin system for external rule packs and collectors
- Config resolution via filesystem upward search, `--config` flag, or `MAAT_CONFIG` env var
