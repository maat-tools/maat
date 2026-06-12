# `maat axiom supersede`

Marks an active axiom as replaced by a newer decision.

```bash
maat axiom supersede --id stable-boundary --reason "Replaced by package-boundary-rule"
maat --config ./path/to/maat.config.ts axiom supersede --id stable-boundary --reason "Replaced by package-boundary-rule"
```

## What superseding means

Superseding keeps the old axiom in ledger history, but marks it inactive in the current state.

Use this when the claim is not wrong, but a newer axiom or automated rule is now the source of truth.

## Options

| Option | Purpose |
|---|---|
| `--id <id>` | **Required.** Axiom id to supersede. |
| `--reason <reason>` | **Required.** Explanation for supersession. |

## Errors

`maat axiom supersede` requires a configured ledger. The command exits with an error when no ledger is configured, when the axiom id is not found in the ledger, or when the axiom is already inactive (revoked or superseded).
