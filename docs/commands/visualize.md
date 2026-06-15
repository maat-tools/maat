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

Axioms are shown unless `--no-axioms` is passed. Only active axioms are displayed; revoked and superseded axioms are hidden.

## Options

| Option | Purpose |
|---|---|
| `--filter <states>` | Comma-separated groups to show: `observed`, `baselined`, `resolved`, `unverified`, `revoked`. |
| `--no-axioms` | Hide declared axioms. |
| `--insights` | Run insights against the current ledger state. |
| `--json` | Output as JSON. |

## When to use it

Use `maat visualize` when you need to inspect the ledger state without running the collectors and rules again.
