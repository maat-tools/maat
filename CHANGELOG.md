# Changelog

All notable changes to maat will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). maat uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Initial monorepo structure: `contracts`, `vocabulary`, `kernel`, `core`, `collector-ts`, `coupling-rules`, `file-ledger`, `cli`
- Connascence of Meaning rule (CoM) as the first shipped rule
- NDJSON append-only ledger backend
- `maat check` CLI command with `--enforce` flag
- `maat decide` CLI command for promoting observations to properties
- Retroactive history walk over git commits
- `maat.config.ts` plugin system for external rule packs and collectors
