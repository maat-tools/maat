# maat

<p align="center">
  <img src="docs/assets/maat.png" alt="maat balance icon" width="96" />
</p>

<p align="center">
  <strong>Check that your code follows your team's rules.</strong>
</p>

Maat checks the rules you define for your project, keeps a history of your decisions, and warns when rules are broken or resolved problems return. It works in new and existing codebases, whether people, AI agents, or both write the code.

## Why Maat exists

Teams make decisions about how their software should work: which packages may depend on each other, where database access belongs, or which layers should stay independent. Those decisions can be difficult to keep track of as the code changes.

Maat lets you turn supported constraints into configured checks and run them locally or in CI. A ledger records findings, resolutions, temporary exceptions, and declared decisions so the context can travel with the code.

These checks cover the rules you configure. They do not establish that the whole codebase is healthy or free of defects, and recording a decision in text does not create an automated check.

## What it looks like

This recording shows Maat checking a configured layer rule in Cal.com and opening the source behind a finding:

<p align="center">
  <img src="docs/public/calcom-maat-demo.gif" alt="Terminal recording of Maat reporting dependencies forbidden by a configured layer rule in Cal.com, then opening the source file." width="100%" />
</p>

Configure the rules your project needs in `maat.config.ts`:

```ts
import { defineConfig } from '@maat-tools/core'
import { layer, Pure } from '@maat-tools/coupling-rules'

export default defineConfig({
  check: { strict: true },
  collectors: [['@maat-tools/collector-ts', { tsConfigFilePath: './tsconfig.json' }]],
  rules: [
    // "Business logic stays free of databases, HTTP, and frameworks."
    layer('@myapp/domain').is(Pure).build(),
    // "Infrastructure may use the domain and shared contracts. Nothing else."
    layer('@myapp/infra').allows('@myapp/domain', '@myapp/contracts').build(),
  ],
})
```

Then run `maat check`. For example, forbidden imports would produce findings like these (illustrative output):

```
FINDINGS (2)
────────────

  [layer-purity] — 2 finding(s)
    9f3ac1d2  '@myapp/domain' imports 'pg' — declared Pure
            ↳ file: src/domain/billing/invoice.ts import: pg
    4b81e07a  '@myapp/domain' imports 'axios' — declared Pure
            ↳ file: src/domain/orders/pricing.ts import: axios
```

Each finding has a fingerprint that identifies it across runs. With a ledger configured, Maat compares current findings with recorded decisions. If a finding marked as resolved returns with the same fingerprint, Maat reports a regression and fails the check. Identity depends on the rule's identifier; a rename or rule change can produce a different fingerprint.

Your team reviews the evidence and decides whether to fix a finding or accept it for a limited time. You can commit the ledger file to Git to preserve that history alongside the code. Maat does not commit it for you or attach an actor identity to each event; commits and reviews can document who made a decision.

## How it works

1. **Collectors gather facts** from code or Git history, such as imports and files that change together.
2. **Optional enrichers derive additional facts**, including through LLM calls. Facts from enrichers carry uncertainty.
3. **Rules check facts against your constraints.** Official rules produce the same findings for the same facts and rule version.
4. **The ledger tracks findings and decisions over time.** Configuring a ledger lets checks read its history; `maat check --ledger` also writes events.

Findings based on enriched facts require human verification. New unverified findings do not fail strict checks on their own. There is an exception: if a probabilistic finding recorded as resolved returns, the regression fails the check even while verification is pending and even with strict mode disabled.

## Where to use it

In a new project, configure boundaries as you build and check them in CI. In an existing codebase, review the first findings and record temporary exceptions for those you accept. The same checks apply to changes written by people and AI agents.

Start with a constraint your team can explain and a rule that can check it. See the [adoption guide](docs/guide/adoption.md) for both workflows.

## Getting started

Install the CLI:

```bash
npm install -D @maat-tools/cli
# or
bun add -d @maat-tools/cli
# or run without installing
npx maat check
bunx maat check
```

The CLI is just the runner. Collectors, rules, and ledger backends are separate packages you install based on what you need:

```bash
npm install -D @maat-tools/core @maat-tools/collector-ts @maat-tools/coupling-rules
```

Add a `maat.config.ts` to your project root (see the example above) and run:

```bash
maat check
```

The CLI searches upward from the current directory for `maat.config.ts`. You can also pass it explicitly:

```bash
maat --config ./path/to/maat.config.ts check
# or
MAAT_CONFIG=./maat.config.ts maat check
```

### pnpm and monorepos

In a pnpm workspace, install the dev dependencies at the workspace root with `-w`:

```bash
pnpm add -D -w @maat-tools/cli @maat-tools/core @maat-tools/collector-ts @maat-tools/coupling-rules
```

Two things to know in a monorepo:

- **`tsConfigFilePath` decides what gets analyzed.** The TypeScript collector reads the files a single `tsconfig.json` includes. Point it at one package's `tsconfig.json` and maat sees only that package. To check boundaries *across* packages, point it at a tsconfig whose `include` covers every package you care about — a root `tsconfig.json` that only sets `exclude` (no `include`) collects nothing. A common setup is a dedicated `tsconfig.maat.json` that includes all package sources:

  ```jsonc
  // tsconfig.maat.json
  {
    "extends": "./tsconfig.json",
    "include": ["packages/*/src/**/*.ts"]
  }
  ```

  ```ts
  collectors: [['@maat-tools/collector-ts', { tsConfigFilePath: './tsconfig.maat.json' }]],
  ```

- **`minimumReleaseAge` can block a fresh release.** Supply-chain-conscious workspaces (via pnpm's `minimumReleaseAge`) refuse packages published more recently than a set window. If a just-published maat version won't install, that is why — wait out the window, or add `@maat-tools/*` to `minimumReleaseAgeExclude`.

## Starting a new codebase

Keep `check.strict: true` and add `maat check` to CI. Visible findings that do not require verification fail the command. Findings based on probabilistic facts need human review, subject to the regression exception described above.

Start with rules that are easy to explain in code review: which packages may depend on which, which layers stay pure, which direction dependencies flow. Add more specific rules when the team has a real pattern it wants to protect.

Use an axiom to record a decision or claim in the ledger, including one that has no automated check yet. This command requires a configured ledger:

```bash
maat axiom declare \
  --id "domain-purity" \
  --scope "@myapp/domain" \
  --claim "The domain layer has no infrastructure dependencies." \
  --note "Keeps the domain testable without spinning up real I/O."
```

## Adopting maat in an existing codebase

The first run may find existing violations of the rules you configured. Review those findings and use a baseline for the ones you accept temporarily. This lets you adopt checks without fixing every existing finding first.

Install the ledger backend alongside your collectors and rules:

```bash
npm install -D @maat-tools/file-ledger
```

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

```bash
# Save current findings; this can still exit non-zero before acceptance
maat check --ledger

# Accept today's findings as the starting point (expires in 30 days by default)
maat baseline

# Accept with a shorter window (1–90 days)
maat baseline --expires-in 30

# Mark one fixed finding as resolved
maat resolve --fingerprint <fingerprint>
```

Baselines last 1–90 days. An expired baseline fails `maat check`, regardless of strict mode, even if the finding has disappeared. `maat check --ledger` records automatic resolution for missing findings, so the next run no longer sees that expired baseline. Review findings before baselining: `maat baseline` accepts observed records and renews expired baselines; unverified records need `maat verify` first.

The ledger keeps an append-only history of findings, declared decisions, and exceptions. Commit it with the codebase when you want that history versioned. Ordinary CI checks can read the configured ledger without writing to it.

## Official plugins

| Package | What it does |
|---|---|
| `@maat-tools/collector-ts` | Reads facts from TypeScript projects |
| `@maat-tools/collector-git` | Reads facts from git history |
| `@maat-tools/coupling-rules` | Rules for layers, package boundaries, and dependency direction |
| `@maat-tools/connascence-rules` | Rules for code that has to change together but doesn't say so |
| `@maat-tools/git-rules` | Rules for churn and files that keep changing together over time |
| `@maat-tools/presets-ts` | Ready-made pattern definitions for TypeScript |
| `@maat-tools/enricher-llm` | AI-assisted fact extraction (facts only — rules still decide) |
| `@maat-tools/insights` | Cross-rule analysis and pattern detection |
| `@maat-tools/file-ledger` | The append-only history file backend |

maat exposes public interfaces for third-party collectors, rules, insights, and ledger backends — the built-in packages use the same interfaces you would. Third-party packages are outside the official repeatability guarantee, so review them before trusting them in CI.

## Commands

| Command | Purpose |
|---|---|
| `maat check` | Run collectors and rules. `--ledger` syncs findings with the ledger; `--show <mode>` picks printed sections. |
| `maat axiom declare` | Record a human-authored agreement in the ledger. |
| `maat axiom supersede` | Mark an agreement as replaced by a newer decision. |
| `maat axiom revoke` | Revoke an agreement that no longer applies. |
| `maat baseline` | Accept current findings for a limited time (1–90 days), forcing periodic review. |
| `maat resolve` | Mark one exact finding as intentionally fixed. |
| `maat verify` | Verify, dismiss, or reopen a probabilistic finding after human review. |
| `maat visualize` | Print current ledger state: findings, agreements, and optional insights. |

## Documentation

- [Getting started](docs/guide/getting-started.md)
- [Fitness functions](docs/guide/fitness-functions.md) — how maat relates to *Building Evolutionary Architectures*
- [Commands](docs/commands/)
- [Determinism](docs/guide/determinism.md) — repeatable rule evaluation and the limits of probabilistic facts
- [Plugin system](docs/guide/plugins.md)
- [Architecture decisions](docs/adr/)

## Status

Maat is pre-1.0. Available now: configured checks, recorded decisions, temporary exceptions, human verification, and detection of returning findings. Package APIs may change before 1.0.

A broader view of software health, critical modules, and possible costs is a future direction, not a capability of the current checks.

## License

Apache-2.0
