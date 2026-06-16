# `maat verify`

Verify, dismiss, or reopen a probabilistic finding that was flagged with `[Verify]`.

```bash
maat verify --fingerprint <fingerprint>
maat verify --fingerprint <fingerprint> --revoke
maat verify --fingerprint <fingerprint> --reopen
maat verify --fingerprint <fingerprint> --reason "Confirmed by architecture review"
maat --config ./path/to/maat.config.ts verify --fingerprint <fingerprint>
```

## What it does

`maat verify` is the human-in-the-loop step for probabilistic findings. It moves a finding between lifecycle states in the ledger:

- **verify** (default): promotes a `finding.unverified` record to `finding.observed`, converting a probabilistic finding into a trusted, deterministic one.
- **`--revoke`**: dismisses an `unverified` finding as a false positive, recording `finding.revoked`.
- **`--reopen`**: brings a previously `revoked` finding back to `unverified` for re-review.

When the kernel produces a finding that depends on enriched facts, it marks the finding with `requiresVerification: true`. When `maat check --ledger` runs, these findings are written to the ledger as `finding.unverified`. They:

- Display a `[Verify]` badge in CLI output
- Never break strict builds

After `maat verify`, the finding is treated as deterministic on subsequent runs.

## Verification lifecycle

```
Kernel produces finding from enriched fact
    ↓
CLI shows [Verify] badge
    ↓
maat check --ledger writes finding.unverified to ledger
    ↓
Human reviews the finding:

    maat verify --fingerprint <fp>            → finding.observed  (trusted; treated as deterministic)
    maat verify --fingerprint <fp> --revoke   → finding.revoked   (dismissed; hidden on later runs)

A revoked finding is not a dead end:

    maat verify --fingerprint <fp> --reopen   → finding.unverified (back for re-review)
```

A reopened finding returns to `unverified`, so it shows the `[Verify]` badge again and can be verified or revoked as usual.

## Dismissal

If a finding is a false positive, dismiss it:

```bash
maat verify --fingerprint <fingerprint> --revoke
```

This appends a `finding.revoked` event. The finding is hidden from output on subsequent runs. Dismissal only applies to findings currently in the `unverified` state.

## Reopening a dismissal

If a finding was revoked by mistake — or you want to reconsider it — reopen it:

```bash
maat verify --fingerprint <fingerprint> --reopen
```

This appends a `finding.unverified` event (restoring `requiresVerification`), so the finding re-enters the verification flow. Reopening only applies to findings currently in the `revoked` state.

## Options

| Option | Purpose |
|---|---|
| `--fingerprint <fp>` | **Required.** The fingerprint of the finding to verify, dismiss, or reopen. |
| `--revoke` | Dismiss the finding instead of verifying it. Only valid for `unverified` findings. |
| `--reopen` | Move a `revoked` finding back to `unverified`. Only valid for `revoked` findings. |
| `--reason <text>` | Optional human-readable reason, persisted on the resulting verify, revoke, or reopen event. |

`--revoke` and `--reopen` are mutually exclusive; passing both exits with an error.

## Validation and exit behavior

`maat verify` exits non-zero when:

- no ledger is configured;
- `--fingerprint` is missing, or the fingerprint is not found in the ledger;
- `--revoke` and `--reopen` are passed together;
- `--reopen` targets a finding that is not `revoked`;
- the finding is already `observed` (already verified);
- without `--reopen`, the finding is not in the `unverified` state (for example `baselined` or `resolved`).

## Why this exists

Enrichers produce probabilistic facts. Rules consuming those facts produce findings that carry uncertainty. The system does not auto-approve these findings because:

- A probabilistic model may hallucinate or misinterpret.
- The same code run twice through an LLM may produce different enriched facts.
- Build-breaking findings must be trustworthy.

Human verification is the explicit trust boundary. A verified finding is a decision that a human has reviewed the probabilistic output and accepted it as valid for this codebase. Revocation and reopening keep that decision reversible: a dismissal is never permanent and can always be brought back for review.

## Related

- [Enrichers](/guide/enrichers)
- [ADR-011: Enrichers — Probabilistic Facts Without Breaking Determinism](/adr/011-enrichers-probabilistic-facts)
- [`maat check`](/commands/check)
