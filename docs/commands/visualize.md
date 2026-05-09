# `maat visualize`

Prints the current ledger snapshot: findings, axioms, and optional insights.

```bash
maat visualize
maat visualize --filter observed,resolved
maat visualize --insights
maat visualize --json
```

## What it shows

Findings are grouped as:

- `resolved`;
- `observed`;
- `baselined`.

Axioms are shown unless `--no-axioms` is passed.

## Options

| Option | Purpose |
|---|---|
| `--filter <states>` | Comma-separated groups to show: `observed`, `baselined`, `resolved`. |
| `--no-axioms` | Hide declared axioms. |
| `--insights` | Run insights against the current ledger state. |
| `--json` | Output as JSON. |

## When to use it

Use `maat visualize` when you need to inspect the ledger state without running the collectors and rules again.
