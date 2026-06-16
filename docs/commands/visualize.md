# `maat visualize`

Prints the current ledger state: findings, axioms, and optional insights.

```bash
maat visualize
maat visualize --filter observed,resolved
maat visualize --insights
maat visualize --json
maat --config ./path/to/maat.config.ts visualize
```

## What it shows

Findings are grouped as:

- `observed`;
- `baselined`;
- `resolved`;
- `unverified`;
- `revoked`.

Axioms are shown unless `--no-axioms` is passed. Every axiom is displayed and labelled with its current status:

- `active` — a declared axiom that is still in force (shown in green);
- `superseded` — replaced by a newer decision (shown in yellow);
- `revoked` — no longer applicable (shown in red).

Superseded and revoked axioms also display the `reason` recorded when they were changed.

## Options

| Option | Purpose |
|---|---|
| `--filter <states>` | Comma-separated groups to show: `observed`, `baselined`, `resolved`, `unverified`, `revoked`. |
| `--no-axioms` | Hide declared axioms. |
| `--insights` | Run insights against the current ledger state. |
| `--json` | Output as JSON. |

## When to use it

Use `maat visualize` when you need to inspect the ledger state without running the collectors and rules again.
