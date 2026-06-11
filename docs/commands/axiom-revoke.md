# `maat axiom revoke`

Marks an active axiom as no longer applicable.

```bash
maat axiom revoke --id stable-boundary --reason "Boundary no longer exists"
maat --config ./path/to/maat.config.ts axiom revoke --id stable-boundary --reason "Boundary no longer exists"
```

## What revoking means

Revoking keeps the original declaration in ledger history, but marks the axiom inactive in the current state.

Use this when the claim should no longer be treated as true or useful.

## Options

| Option | Purpose |
|---|---|
| `--id <id>` | **Required.** Axiom id to revoke. |
| `--reason <reason>` | Optional explanation for revocation. |

## Errors

`maat axiom revoke` requires a configured ledger. The command exits with an error when no ledger is configured, when the axiom id is not found in the ledger, or when the axiom is already inactive (revoked or superseded).
