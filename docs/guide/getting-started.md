# Getting started

Maat checks architecture rules against facts collected from your repository.

The first run should answer a small question: "can this codebase collect facts and report findings?" After that, you can decide which findings should be baselined, resolved, or ignored for now.

## Installation

```bash
npm install -g @maat-tools/cli
# or
bun add -g @maat-tools/cli
```

## Add a config

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

This config does three things:

- `collectors` tells Maat how to collect facts from the repository.
- `rules` tells Maat which architecture rules to check.
- `check.strict` makes visible findings fail the command.

## Run a check

```bash
maat check
```

Maat prints findings with stable fingerprints. A fingerprint identifies the same finding across runs, so the ledger can track what happened to it later.

The CLI searches upward from the current directory for `maat.config.ts`. You can also pass it explicitly:

```bash
maat --config ./path/to/maat.config.ts check
# or via env: MAAT_CONFIG=./maat.config.ts maat check
```

## New projects

For a new project, keep `check.strict: true` and add `maat check` to CI. Any visible finding exits non-zero.

Start with rules that are easy to explain in code review: package boundaries, layer boundaries, and dependency direction. Add more specific rules when the team has a real pattern it wants to preserve.

## Existing projects

Existing codebases usually have findings on the first run. Use a ledger when you want to keep those findings visible without blocking every change immediately.

Add a ledger backend to the config:

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
  ledger: ['@maat-tools/file-ledger', { path: './maat-ledger.ndjson' }],
})
```

Then record the current findings and baseline them:

```bash
maat check --ledger
maat baseline
```

A baseline means: "we saw this finding, we are not fixing it in this pass, and we want to revisit it later." Baselines expire, so old architectural debt does not become invisible.

## Finding decisions

A finding is the current output of a rule. Its fingerprint is the stable identity Maat uses to recognize the same architectural fact across runs.

The ledger records decisions about those fingerprints:

- `observed`: Maat saw the finding and saved it to the ledger. No human decision has been made yet.
- `baselined`: the finding is temporarily accepted as existing debt. This is a suppression flag, not a full lifecycle state; unexpired baselines are hidden from normal `maat check` output unless you pass `--show-baselined`.
- `resolved`: this exact fingerprint was intentionally fixed. If the same fingerprint appears again later, `maat check` treats it as a regression.

In short: baseline means "not now"; resolve means "this exact finding was fixed."

Use these commands when you are ready to move a finding:

```bash
# Mark a fixed fingerprint as resolved
maat resolve --fingerprint <fingerprint>
```

Resolved findings should have a decision maker. Maat records the decision in the ledger, but it does not attach findings to users or teams. With the default NDJSON ledger, commit the ledger file and let the repository history show who made the decision, when it was reviewed, and why it changed.

Resolution is fingerprint-specific. If another finding from the same rule appears with a different fingerprint, Maat treats it as a new finding, not as a regression of the resolved one.

## Manual architecture claims

Some rules are not checked by a collector or rule yet. Use an axiom when you want to record a manual architecture claim in the ledger.

```bash
maat axiom declare \
  --id "domain-purity" \
  --scope "@myapp/domain" \
  --claim "The domain layer has no infrastructure dependencies." \
  --note "Keeps the domain testable without spinning up real I/O."
```

An axiom is not an automated check. It is a recorded decision or claim the team wants to keep next to the codebase.

## Next steps

- Read the [commands reference](/commands/) for every CLI option.
- Read the [plugin guide](./plugins.md) when you want to write custom collectors or rules.
- Read the [determinism guide](./determinism.md) before running third-party plugins in CI.
