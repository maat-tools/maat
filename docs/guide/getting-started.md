# Getting started

## Installation

```bash
npm install -g @maat-tools/cli
# or
bun add -g @maat-tools/cli
```

## Quick start

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

Then run:

```bash
maat check
```

The CLI searches upward from the current directory for `maat.config.ts`. You can also pass it explicitly:

```bash
maat --config ./path/to/maat.config.ts check
# or via env: MAAT_CONFIG=./maat.config.ts maat check
```

## New projects

Use `strict: true` when new violations should fail the command.

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

Add `maat check` to CI. Any violation exits non-zero.

Use axioms for rules that are not checked by a collector or rule yet:

```bash
maat axiom declare \
  --id "domain-purity" \
  --scope "@myapp/domain" \
  --claim "The domain layer has no infrastructure dependencies." \
  --note "Keeps the domain testable without spinning up real I/O."
```

Axioms are stored in the ledger.

## Existing projects

Use the ledger when the current codebase already has violations you do not want to fail immediately.

```bash
# Accept the current state as baseline
maat check --ledger
maat baseline

# Mark a finding as reviewed
maat promote --fingerprint <id>

# Make the finding fail future checks
maat promote --fingerprint <id> --enforce

# Mark a fixed finding as resolved
maat resolve --fingerprint <id>
```

Findings move through a linear lifecycle:

```
observed → promoted → enforced
```

Every state transition is recorded with author and timestamp.
