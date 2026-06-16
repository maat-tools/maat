# `maat resolve`

Marks a finding fingerprint as intentionally fixed.

```bash
maat resolve --fingerprint <fingerprint>
maat --config ./path/to/maat.config.ts resolve --fingerprint <fingerprint>
```

## Resolution is per fingerprint

`resolved` is a decision about one exact fingerprint. It does not protect the whole rule.

When a resolved fingerprint appears again, maat treats that as a regression and exits non-zero. A different finding from the same rule gets a different fingerprint and starts as a new finding.

## Why resolution is explicit

When a finding disappears, maat does not assume the architecture was fixed. The finding could have disappeared because:

- the code was corrected;
- the rule changed;
- the fingerprint inputs changed;
- the collector stopped seeing the relevant fact.

`maat resolve` records the human decision: "this fingerprint was fixed, and the same fingerprint should not come back."

## State transitions

Not every ledger state can be resolved. The command checks the current state of the finding before appending a `finding.resolved` event:

| Current state | Behavior |
|---|---|
| `observed` | Resolved. A `finding.resolved` event is appended. |
| `baselined` | Resolved with a warning. The baseline is superseded by the resolution. |
| `resolved` | Rejected (exit 1). The finding is already resolved. |
| `revoked` | Rejected (exit 1). A revoked finding cannot be resolved. |
| `unverified` | Rejected (exit 1). Use `maat verify` first to promote the finding to `observed`. |

Observed findings that disappear are also resolved automatically by `maat check --ledger` when they were not baselined.

## Options

| Option | Purpose |
|---|---|
| `--fingerprint <fingerprint>` | **Required.** Fingerprint of the finding to resolve. |

## Regression behavior

If a resolved fingerprint appears again later, `maat check` treats that exact fingerprint as a regression and exits non-zero.
