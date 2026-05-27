# `maat baseline`

Marks all unbaselined findings currently stored in the ledger as temporarily accepted debt.

```bash
maat check --ledger
maat baseline
maat baseline --expires-in 14
maat --config ./path/to/maat.config.ts baseline --expires-in 14
```

## What a baseline means

A baseline means: "we saw this finding, we are not fixing it in this pass, and we want to revisit it later."

Baselining is a suppression flag on a finding record. It does not mean the finding is good or fixed. It lets an existing codebase adopt Maat without making every old finding block every run.

## Expiry

Baselines expire. When a baseline expires, `maat check` fails until the team revisits the finding by fixing it, re-baselining it, promoting it, or enforcing it.

Permanent baselines are intentionally not supported.

## Options

| Option | Purpose |
|---|---|
| `--expires-in <days>` | Days until the baseline expires. Must be between 1 and 90. Default: 30. |

## When to use it

Use `maat baseline` for first adoption in a brownfield codebase. Use `maat resolve` when the underlying issue has been fixed and the exact fingerprint should be treated as a regression if it appears again.
