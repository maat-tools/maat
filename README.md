# maat

<p align="center">
  <img src="docs/assets/maat-repo-preview.png" alt="maat architectural governance preview" width="420" />
</p>

> *"It does not tell you what to build. It tells you when you are breaking what you built."*

maat is an architectural governance tool for TypeScript codebases. It finds the coupling that is hard to find — structural today, semantic on the roadmap — turns each candidate into a first-class attributed decision, and optionally enforces it in CI.

Unlike snapshot analyzers (SonarQube, Structure101) or rule enforcers (ESLint, dependency-cruiser), maat closes the full loop: **detect → decide → record → enforce**. Every architectural claim is a permanent, attributed entry in a ledger — tied to the commit and author that created it, queryable across time.

The foundation of all of this is **determinism**. The kernel is a pure function: given the same codebase state, it always produces the same findings. No randomness, no LLM in the evaluation path, no hidden state. Determinism is what makes the ledger trustworthy — without it, an attributed decision is meaningless.

## How it works

Findings move through a linear lifecycle:

```
observation → property → enforced
```

- **observation** — the detector found something. You haven't reviewed it yet.
- **property** — you reviewed it and confirmed it as a real architectural claim.
- **enforced** — you escalated it to a CI gate. A drift causes `exit 1`.

**Axioms** are a parallel concept: architectural claims only a human can declare (bounded-context boundaries, team ownership, strategic decisions). They live in the same ledger, attributed to the same commit and author.

Every state transition is recorded in an append-only NDJSON ledger alongside the author and commit SHA that caused it.

## Getting started

```bash
bun install
```

Add a `maat.config.ts` at the root of your project:

```ts
import { defineConfig } from '@maat/core'

export default defineConfig({
  collectors: [['@maat/collector-ts', { tsConfigFilePath: './tsconfig.json' }]],
  rules: [['@maat/coupling-rules', {}]],
  ledger: ['@maat/file-ledger', { path: './maat-ledger.ndjson' }],
})
```

Run the first check:

```bash
maat check
```

The CLI searches from the current directory upward for `maat.config.ts` and
the other `maat.config.*` variants. You can also pass a file explicitly:

```bash
maat --config ./maat.config.ts check
```

For CI or scripts, `MAAT_CONFIG=./path/to/maat.config.ts` works too.

All findings start as `observation`. Use `maat baseline` to accept the current state as the starting point, then `maat promote` and `maat enforce` as you review.

## Packages

| Package | Role |
|---|---|
| `@maat/contracts` | Shared TypeScript interfaces and branded factories |
| `@maat/vocabulary` | Canonical IR types and capability keys |
| `@maat/kernel` | Orchestrates collectors → facts → rules → findings |
| `@maat/core` | Config schema and `defineConfig` |
| `@maat/collector-ts` | TypeScript AST walker |
| `@maat/coupling-rules` | Rule pack — Connascence of Meaning |
| `@maat/file-ledger` | Append-only NDJSON ledger backend |
| `@maat/cli` | CLI entry point |

## Architecture

Design decisions are documented in [docs/adr/](docs/adr/).

## License

Apache-2.0
