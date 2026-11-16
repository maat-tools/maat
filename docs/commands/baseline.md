# `maat baseline`

Temporarily accepts all observed findings stored in the ledger and renews expired baselines. Unverified, resolved, and revoked records are excluded.

```bash
maat check --ledger
maat baseline
maat baseline --expires-in 14
maat --config ./path/to/maat.config.ts baseline --expires-in 14
```

## What a baseline means

A baseline means: "we saw this finding, we are not fixing it in this pass, and we want to revisit it later."

Baselining appends a `finding.baselined` event that suppresses the fingerprint until expiry. It does not mean the finding is good or fixed. It lets an existing codebase adopt maat without making every old finding block every run.

## Expiry

An expired baseline fails `maat check`, regardless of strict mode, even when the finding has disappeared. If it has disappeared, `maat check --ledger` writes a resolution event, but that run still fails based on the expired baseline read at its start; the next run no longer sees that baseline. For a finding still present, review it before fixing, resolving, or renewing the baseline.

Permanent baselines are intentionally not supported.

## Options

| Option | Purpose |
|---|---|
| `--expires-in <days>` | Days until the baseline expires. Must be between 1 and 90. Default: 30. |

## Scope

`maat baseline` selects **all** observed records and expired baselines at once. Unverified findings must be reviewed with `maat verify` first. There is no way to baseline a single finding by fingerprint. This is intentional: a baseline represents a team decision to accept the current state of the codebase as a whole, not a per-finding judgment.

If you need to address a single finding, fix the underlying issue and let `maat check --ledger` resolve it automatically, or use `maat resolve --fingerprint <fingerprint>` to mark it as fixed.

## When to use it

Use `maat baseline` for first adoption in a brownfield codebase. Use `maat resolve` when the underlying issue has been fixed and the exact fingerprint should be treated as a regression if it appears again.
