# maat

<p align="center">
  <img src="docs/assets/maat.png" alt="maat balance icon" width="96" />
</p>

<p align="center">
  <strong>Linters check lines. maat checks the agreements your team made about the codebase.</strong>
</p>

Every team has rules that no linter knows about. *The domain layer never talks to the database directly. These two modules must not know about each other. This policy is implemented in one place only.* Those rules live in code review comments, onboarding chats, and a few people's heads — and they erode quietly, one reasonable-looking PR at a time.

maat lets you write those agreements down as code, checks them on every run, and keeps a committed history of every violation and every decision your team made about it.

## Why maat exists

Most teams living with a hard-to-change codebase share the same picture: the same kinds of bugs keep coming back, the time goes to firefighting, and nobody asks why — that's just how work feels. When someone finally reviews the architecture by hand, they find the reasons: rules everyone had silently agreed on, broken little by little over years, where every individual change looked fine.

And then the review usually fails anyway — not because it's wrong, but because it arrives without evidence. There's no way to show *when* each rule started slipping, how fast, or what it's costing. It's one engineer's word against the status quo.

maat is that review, automated, with the receipts built in. It exists to answer the question a good tech lead carries in their head, on every commit, with a paper trail:

> We agreed the codebase would work this way. Is that still true? Since when isn't it?

## What it looks like

Running `maat check` against a real codebase:

<p align="center">
  <img src="docs/public/calcom-maat-demo.gif" alt="maat finding a layer violation in Cal.com" width="100%" />
</p>

You write an agreement in `maat.config.ts`:

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

Then `maat check` tells you where reality disagrees:

```
FINDINGS (2)
────────────

  [layer-purity] — 2 finding(s)
    9f3ac1d2  '@myapp/domain' imports 'pg' — declared Pure
            ↳ file: src/domain/billing/invoice.ts import: pg
    4b81e07a  '@myapp/domain' imports 'axios' — declared Pure
            ↳ file: src/domain/orders/pricing.ts import: axios
```

Each finding has a stable ID, so the same problem stays the same problem across commits and renames. Your team decides what to do with it — fix it, or accept it for a limited time — and that decision is recorded in a history file (the **ledger**) committed next to the code. Six months later, nobody has to remember why an exception exists: the history says who accepted it, when, and for how long.

## What maat is not

maat is not a linter, a code grader, or an AI reviewer.

Linters tells you a line breaks a style rule. SonarQube gives your code a score. maat answers a different question: **is the codebase still keeping the promises your team made about it — and if not, since when?** The problems it catches are invisible to line-by-line tools, because every individual line is fine. The damage is in the relationships: a module that quietly learned about another, a policy that now exists in three slightly different copies, a "temporary" shortcut that became a load-bearing wall.

## How it works

1. **Collectors read your repository** and write down plain facts: which files import which, what lives in which layer, what tends to change together in git history.
2. **Rules compare those facts against your agreements.** Rules are boring on purpose: same facts in, same findings out. No randomness, no network calls, no hidden state.
3. **Findings get stable IDs** so they can be tracked over time instead of rediscovered on every run.
4. **Decisions go in the ledger** — a plain append-only file committed with your repo. Accepted exceptions expire and force a revisit; nothing is swept under the rug permanently.

Some facts can't be parsed, only read — like noticing that two functions implement the same business policy in different ways. For those, maat's design allows AI-assisted collectors to *extract* facts from code. But AI never gets a vote: it can report what it read, and the same boring rules decide whether that's a violation. Results stay repeatable.

maat records decisions, not people. The ledger exists so context survives when the person who had it leaves — it is about understanding the codebase's history, not assigning blame.

## Who gets the most out of it

Backend codebases with real business logic, layers, and module boundaries — the bigger and older, the more maat has to say. If your project is small enough that one person holds all the rules in their head, you probably don't need it yet. Write the config anyway; that person won't be there forever.

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

## Starting a new codebase

Write the rules before the shortcuts settle in. Keep `check.strict: true` and add `maat check` to CI — any visible finding exits non-zero, so an accidental dependency fails the build before it becomes precedent.

Start with rules that are easy to explain in code review: which packages may depend on which, which layers stay pure, which direction dependencies flow. Add more specific rules when the team has a real pattern it wants to protect.

Some agreements can't be checked by a machine yet. Write them down anyway, so they're versioned and visible instead of tribal:

```bash
maat axiom declare \
  --id "domain-purity" \
  --scope "@myapp/domain" \
  --claim "The domain layer has no infrastructure dependencies." \
  --note "Keeps the domain testable without spinning up real I/O."
```

## Adopting maat in an existing codebase

The first run on a mature codebase will find things. That's expected, and none of it counts against anyone — maat separates *new* violations from *existing* debt so you can adopt rules without first fixing years of history.

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
# Save current findings to the configured ledger
maat check --ledger

# Accept today's findings as the starting point (expires in 30 days by default)
maat baseline

# Accept with a shorter window (1–90 days)
maat baseline --expires-in 30

# Mark one fixed finding as resolved
maat resolve --fingerprint <fingerprint>
```

Accepted findings are time-limited on purpose: when the window expires, `maat check` fails for them and the team has to look again. There is no permanent "ignore" — an exception you never revisit is just erosion with paperwork.

The ledger keeps an append-only history of findings, declared agreements, and decisions. Commit it with the codebase so the decisions travel with the architecture they describe.

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
| `maat visualize` | Print current ledger state: findings, agreements, and optional insights. |

## Documentation

- [Getting started](docs/guide/getting-started.md)
- [Fitness functions](docs/guide/fitness-functions.md) — how maat relates to *Building Evolutionary Architectures*
- [Commands](docs/commands/)
- [Determinism](docs/guide/determinism.md) — why the rules are boring on purpose
- [Plugin system](docs/guide/plugins.md)
- [Architecture decisions](docs/adr/)

## Status

maat is pre-1.0. The CLI can run checks, sync findings with the ledger, and move decisions through baseline and resolve flows. Package APIs can still change while the collector and rule interfaces settle.

## License

Apache-2.0
