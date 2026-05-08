# maat

<p align="center">
  <img src="docs/assets/maat.png" alt="maat balance icon" width="88" />
</p>

> *"It does not tell you what to build. It tells you when you are breaking what you built."*

maat is an architectural governance tool for TypeScript codebases. It enforces the structural rules you define, detects coupling that is hard to find, and records architectural decisions as permanent, attributed ledger entries.

The foundation is **determinism**. The kernel is a pure function: given the same codebase state, it always produces the same findings. No randomness, no LLM in the evaluation path, no hidden state.

## Two modes of use

### Greenfield — rules as law

You are building something new. You know what the architecture should be. maat enforces it from day one so it can never drift.

Define your rules in `maat.config.ts`:

```ts
import { defineConfig } from '@maat-tools/core'
import { layer } from '@maat-tools/coupling-rules'
import { Pure } from '@maat-tools/coupling-rules/roles'

export default defineConfig({
  check: { strict: true },
  collectors: [['@maat-tools/collector-ts', { tsConfigFilePath: './tsconfig.json' }]],
  rules: [
    layer('@myapp/domain').is(Pure).allows('@myapp/contracts'),
    layer('@myapp/infra').allows('@myapp/domain', '@myapp/contracts'),
  ],
})
```

Add `maat check` to CI. Any violation is a build failure. The ledger is optional — `strict: true` is enough.

To record *why* you made an architectural decision, use axioms:

```bash
maat axiom declare \
  --id "domain-purity" \
  --scope "@myapp/domain" \
  --claim "The domain layer has no infrastructure dependencies." \
  --note "Keeps the domain testable without spinning up real I/O."
```

Axioms live in the ledger alongside your code. They are the human side of governance.

### Brownfield — managing existing coupling

You inherited a codebase with existing violations. You can't fix them all today.

```bash
# Accept the current state as baseline — suppresses known violations
maat check --ledger
maat baseline

# As you review, promote findings to acknowledged claims
maat promote --fingerprint <id>

# Escalate to a hard CI gate when you're ready to enforce
maat promote --fingerprint <id> --enforce

# When a violation is finally fixed, confirm the resolution
maat resolve --fingerprint <id>
```

Findings move through a linear lifecycle:

```
observed → promoted → enforced
```

Every state transition is recorded with the author and timestamp.

## Getting started

```bash
npm install -g @maat-tools/cli   # or: bun add -g @maat-tools/cli
```

Add `maat.config.ts` to your project root (see examples above), then:

```bash
maat check
```

The CLI searches upward from the current directory for `maat.config.ts`. You can also pass it explicitly:

```bash
maat --config ./path/to/maat.config.ts check
# or via env: MAAT_CONFIG=./maat.config.ts maat check
```

## Commands

| Command | Purpose |
|---|---|
| `maat check` | Scan for architectural findings. `--ledger` to sync with ledger. |
| `maat axiom declare` | Record a human-authored architectural claim in the ledger. |
| `maat axiom supersede` | Mark an axiom as replaced by a newer one. |
| `maat axiom revoke` | Revoke an axiom that no longer applies. |
| `maat baseline` | Accept current findings as the starting point. |
| `maat promote` | Promote a finding to acknowledged; `--enforce` to make it a CI gate. |
| `maat resolve` | Confirm intentional resolution of a promoted or enforced finding. |
| `maat visualize` | Display current ledger state: findings, axioms, insights. |

## Packages

| Package | Role |
|---|---|
| `@maat-tools/contracts` | Shared TypeScript interfaces and branded factories |
| `@maat-tools/vocabulary` | Canonical IR types and capability keys |
| `@maat-tools/kernel` | Orchestrates collectors → facts → rules → findings |
| `@maat-tools/core` | Config schema and `defineConfig` |
| `@maat-tools/collector-ts` | TypeScript AST walker |
| `@maat-tools/coupling-rules` | Rule pack — layer dependency allowlists |
| `@maat-tools/connascence-rules` | Rule pack — Connascence of Meaning |
| `@maat-tools/file-ledger` | Append-only NDJSON ledger backend |
| `@maat-tools/cli` | CLI entry point |

## Architecture

Design decisions are documented in [docs/adr/](docs/adr/).

## Status

`0.1.0` — early development release. The CLI works end-to-end. APIs are not yet stable and packages are not yet published to npm. See [CHANGELOG.md](CHANGELOG.md).

## License

Apache-2.0
