# `maat axiom declare`

Records a human-authored architectural claim in the ledger.

```bash
maat axiom declare \
  --id stable-boundary \
  --scope packages/core \
  --claim "Core must not import CLI code"
maat --config ./path/to/maat.config.ts axiom declare \
  --id stable-boundary \
  --scope packages/core \
  --claim "Core must not import CLI code"
```

## What an axiom is

An axiom is not an automated finding. It is a manual claim the team wants to keep next to the codebase until there is a rule that can check it.

Axioms can also cover specific finding fingerprints. A covered fingerprint is treated as an explicit exception while the axiom is active.

```bash
maat axiom declare \
  --id domain-db-exception \
  --scope @myapp/domain \
  --claim "The legacy domain database adapter is allowed until the repository split." \
  --fingerprints abc123,def456
```

## Options

| Option | Purpose |
|---|---|
| `--id <id>` | **Required.** Stable slug identifying the axiom. |
| `--scope <scope>` | **Required.** Architectural scope the axiom applies to. |
| `--claim <claim>` | **Required.** Invariant or exception being asserted. |
| `--note <note>` | Optional rationale or references. |
| `--fingerprints <fingerprints>` | Comma-separated finding fingerprints covered by the axiom. Each fingerprint must already exist in the ledger; the command exits with an error otherwise. |
| `--force` | Re-declare an id that currently has an active axiom. A revoked or superseded id can be re-declared without `--force`. |

## Ledger requirement

`maat axiom declare` requires a configured ledger. Without one, the command exits with an error.

## When to use it

Use an axiom for architecture knowledge that should be recorded, reviewed, and versioned, but is not automated by a collector and rule yet.

See [ADRs vs axioms](/guide/adrs-vs-axioms) for how axioms relate to architecture decision records.
