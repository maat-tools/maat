# maat

<p align="center">
  <img src="docs/assets/maat.png" alt="maat balance icon" width="96" />
</p>

<p align="center">
  <strong>Fact-based architecture analysis for codebases.</strong>
</p>

Maat checks architecture rules against facts collected from your repository. It collects structural and semantic facts, runs deterministic rules, reports findings with stable fingerprints, and keeps accepted exceptions in version control.

Maat is not a linter, an AI reviewer, or a diagram generator. It is a collector-based analysis tool: collectors extract facts from a repository, rules evaluate those facts, and the ledger records what was accepted.

## Why Maat exists

Architecture rules often live where the compiler cannot see them: planning docs, ADRs, review comments, diagrams, and conversations.

Maat moves part of that intent into executable rules. Today it ships with a TypeScript collector for source structure. The same model can support other collectors, including semantic ones, without changing the kernel.

It does not decide whether the architecture is good. It reports rule violations and lets your team decide what to baseline or resolve.

## How it works

1. **Collect facts**: collectors turn repository structure, metadata, or other inputs into facts.
2. **Check rules**: rules compare collected facts with the configured boundaries.
3. **Report findings**: violations are shown with stable fingerprints.
4. **Update the ledger**: accepted findings and decisions are stored with the repository.

The official Maat rules are deterministic by guarantee: same collected facts, same rule version, same findings. There is no hidden state, randomness, network access, or LLM judgment inside the check path.

## Getting started

Install the CLI:

```bash
npm install -g @maat-tools/cli
# or
bun add -g @maat-tools/cli
```

Add `maat.config.ts` to your project root:

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

Run:

```bash
maat check
```

The CLI searches upward from the current directory for `maat.config.ts`. You can also pass it explicitly:

```bash
maat --config ./path/to/maat.config.ts check
# or
MAAT_CONFIG=./maat.config.ts maat check
```

## New codebases

Use `check.strict: true` when new violations should fail the command. Add `maat check` to CI and review architecture rules as code.

```ts
export default defineConfig({
  check: { strict: true },
  collectors: [['@maat-tools/collector-ts', { tsConfigFilePath: './tsconfig.json' }]],
  rules: [
    layer('@myapp/domain').is(Pure).allows('@myapp/contracts'),
    layer('@myapp/infra').allows('@myapp/domain', '@myapp/contracts'),
  ],
})
```

Use axioms for architectural claims that are not checked by a collector or rule yet:

```bash
maat axiom declare \
  --id "domain-purity" \
  --scope "@myapp/domain" \
  --claim "The domain layer has no infrastructure dependencies." \
  --note "Keeps the domain testable without spinning up real I/O."
```

## Existing codebases

Use the ledger when the current codebase already has violations you do not want to fail immediately.

```ts
import { defineConfig } from '@maat-tools/core'

export default defineConfig({
  check: { strict: true },
  collectors: [['@maat-tools/collector-ts', { tsConfigFilePath: './tsconfig.json' }]],
  rules: [
    // your rules
  ],
  ledger: ['@maat-tools/file-ledger', { path: './maat-ledger.ndjson' }],
})
```

Then adopt checks gradually:

```bash
# Save current findings to the configured ledger
maat check --ledger

# Accept current findings as the starting point (expires in 30 days by default)
maat baseline

# Accept current findings with a shorter expiry window (1–90 days)
maat baseline --expires-in 30

# Mark one fixed fingerprint as resolved
maat resolve --fingerprint <fingerprint>
```

Baselines are time-limited: after the expiry window (1–90 days, default 90), `maat check` exits with failure for those findings and requires the team to revisit. Permanent baselines are intentionally not supported.

The ledger keeps append-only history for findings, axioms, and lifecycle events. Commit it with the codebase so decisions travel with the architecture they describe.

Maat records decision state, not user identity. For decisions such as baselining or resolving findings, ownership should come from the committed ledger diff, commit author, and review history.

## Official plugins

| Package | Purpose |
|---|---|
| `@maat-tools/collector-ts` | Collects TypeScript imports and constants from a project |
| `@maat-tools/coupling-rules` | Enforces import boundaries between packages and architectural layers |
| `@maat-tools/connascence-rules` | Detects Connascence of Meaning signals across package boundaries |
| `@maat-tools/file-ledger` | Stores finding and axiom history in append-only NDJSON |

Maat also exposes public interfaces for third-party collectors, rules, insights, and ledger backends. Third-party packages are outside the official determinism guarantee, so teams should review them before using them in CI.

## Commands

| Command | Purpose |
|---|---|
| `maat check` | Run configured collectors and rules. Use `--ledger` to sync findings with the ledger and `--show <mode>` to choose printed sections. |
| `maat axiom declare` | Record a human-authored architectural claim in the ledger. |
| `maat axiom supersede` | Mark an axiom as replaced by a newer decision. |
| `maat axiom revoke` | Revoke an axiom that no longer applies. |
| `maat baseline` | Baseline currently observed findings. Expires in 1–90 days, forcing periodic review. |
| `maat resolve` | Mark one exact finding fingerprint as intentionally fixed. |
| `maat visualize` | Print current ledger state: findings, axioms, and optional insights. |

## Packages

| Package | Role |
|---|---|
| `@maat-tools/contracts` | Shared interfaces, factories, and declaration-merging registries |
| `@maat-tools/vocabulary` | Shared fact type definitions |
| `@maat-tools/kernel` | Pure analysis engine that runs collectors and rules |
| `@maat-tools/core` | Config schema, entry resolution, and base ledger behavior |
| `@maat-tools/collector-ts` | TypeScript source collector |
| `@maat-tools/coupling-rules` | Built-in layer and package boundary rules |
| `@maat-tools/connascence-rules` | Built-in Connascence of Meaning rules |
| `@maat-tools/file-ledger` | File-based ledger backend |
| `@maat-tools/cli` | Command-line interface |

## Documentation

- [Getting started](docs/guide/getting-started.md)
- [Commands](docs/commands/)
- [Determinism](docs/guide/determinism.md)
- [Plugin system](docs/guide/plugins.md)
- [Architecture decisions](docs/adr/)

## Status

Maat is pre-1.0. The CLI can run checks, sync findings with the ledger, and move decisions through baseline and resolve flows. Package APIs can still change while the collector and rule interfaces settle.

## License

Apache-2.0
