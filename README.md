# maat

<p align="center">
  <img src="docs/assets/maat.png" alt="maat balance icon" width="96" />
</p>

<p align="center">
  <strong>Turn implicit architecture knowledge into deterministic checks.</strong>
</p>

Maat helps teams capture the coupling, boundaries, and codebase rules that usually live in a few developers' heads. It collects structural and semantic facts from your repository, runs deterministic rules against them, reports findings with stable fingerprints, and keeps accepted exceptions in version control.

Maat is not a linter, an AI reviewer, or a diagram generator. It is a way to turn architectural observations into collectors, deterministic rules, and a ledger of explicit decisions about findings.

In the vocabulary of [*Building Evolutionary Architectures*](https://www.oreilly.com/library/view/building-evolutionary-architectures/9781492097532/) (Neal Ford, Rebecca Parsons, Patrick Kua, Pramod Sadalage), Maat rules are **fitness functions**: automated checks that verify whether your codebase preserves the structural characteristics the team decided to protect.

## Why Maat exists

Large codebases collect rules that are hard to see from one file: which modules may talk to each other, which data shapes are public, which duplicated policies must stay consistent, and which shortcuts have become dangerous.

Those rules often live in review comments, ADRs, debugging sessions, and the memory of people who know the codebase well. Maat gives teams a path to make that knowledge explicit — write collectors for the facts your codebase needs, write rules for the policies you care about, and keep accepted exceptions in version control.

## The invisible coupling

The hardest coupling isn't in import graphs. It's in semantic patterns: multiple code paths executing the same domain operation with different invariants, shared data structures carrying incompatible assumptions across bounded contexts, configuration surfaces that govern the same action from disconnected panels.

These patterns are invisible to linters, type checkers, SAST, and unit tests. Each function works correctly in isolation. Types compile. Tests pass. The damage accumulates silently — orphaned data, broken audit trails, compliance gaps that surface months later.

Maat was born to make these patterns detectable. The direction is clear: specialized collectors (including LLM-assisted ones) gather semantic facts from code, comments, and commit history. Deterministic rules check those facts against policies the team chooses to encode. LLMs for gathering judgment. Rules for guarantees.

## How it works

1. **Collect facts**: collectors turn repository structure, metadata, or team-specific signals into facts.
2. **Check rules**: rules compare those facts with the policies the team chose to encode.
3. **Report findings**: violations are shown with stable fingerprints.
4. **Update the ledger**: accepted findings and decisions are stored with the repository.

The official Maat rules are deterministic by guarantee: same collected facts, same rule version, same findings. There is no hidden state, randomness, network access, or LLM judgment inside the check path.

## Who benefits most

Maat is most useful for backend repositories with meaningful domain logic, layered architectures, and multiple bounded contexts. Frontend projects tend to have less business logic encoded in structure — a linter or type-checker often covers the same ground. If your frontend has complex state machines, domain models, or cross-module contracts, Maat can still help.

## Getting started

Install the CLI in your project:

```bash
npm install -D @maat-tools/cli
# or
bun add -d @maat-tools/cli
# or run without installing
npx maat check
bunx maat check
```

The CLI is just the runner — collectors, rules, insights, and ledger backends are separate packages you install per project based on what you need. See [Official plugins](#official-plugins) below.

Add `maat.config.ts` to your project root. You'll also need to install any collector and rule packages your config references — they are not bundled with the CLI:

```bash
npm install -D @maat-tools/core @maat-tools/collector-ts @maat-tools/coupling-rules
```

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

## New codebases (greenfield)

Write the rules before the shortcuts settle in. Keep `check.strict: true` and add `maat check` to CI. Any visible finding exits non-zero.

Start with rules that are easy to explain in code review: package boundaries, layer boundaries, and dependency direction. Add more specific rules when the team has a real pattern it wants to preserve.

- Prevent accidental dependencies before they become precedent.
- Keep domain code independent from infrastructure and framework details.
- Review architecture rules as code.

```ts
// install @maat-tools/core, @maat-tools/collector-ts, @maat-tools/coupling-rules first
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

## Existing codebases (brownfield)

Start from what the codebase already taught you. Existing systems can turn repeated review notes and manual architecture analysis into checks, baseline existing findings in dedicated ledger PRs, and keep fixed fingerprints from quietly regressing.

- Separate new violations from existing debt.
- Track accepted exceptions in the same repository history as the code.
- Turn repeated review comments into checks.

```ts
// install @maat-tools/core, @maat-tools/collector-ts, @maat-tools/file-ledger first
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

Baselines are time-limited: after the expiry window (1–90 days, default 30), `maat check` exits with failure for those findings and requires the team to revisit. Permanent baselines are intentionally not supported.

The ledger keeps append-only history for findings, axioms, and lifecycle events. Commit it with the codebase so decisions travel with the architecture they describe.

Maat records decision state, not user identity. For decisions such as baselining or resolving findings, ownership should come from the committed ledger diff, commit author, and review history.

## Official plugins

| Package | Purpose |
|---|---|
| `@maat-tools/collector-ts` | Collects facts from TypeScript projects |
| `@maat-tools/collector-git` | Collects facts from Git history |
| `@maat-tools/coupling-rules` | Rules for structural and import boundaries |
| `@maat-tools/connascence-rules` | Rules for semantic coupling and connascence |
| `@maat-tools/git-rules` | Rules for churn and temporal patterns |
| `@maat-tools/insights` | Cross-rule analysis and pattern detection |
| `@maat-tools/file-ledger` | Append-only ledger backend for version control |

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

## Documentation

- [Getting started](docs/guide/getting-started.md)
- [Fitness functions](docs/guide/fitness-functions.md)
- [Commands](docs/commands/)
- [Determinism](docs/guide/determinism.md)
- [Plugin system](docs/guide/plugins.md)
- [Architecture decisions](docs/adr/)

## Status

Maat is pre-1.0. The CLI can run checks, sync findings with the ledger, and move decisions through baseline and resolve flows. Package APIs can still change while the collector and rule interfaces settle.

## License

Apache-2.0
