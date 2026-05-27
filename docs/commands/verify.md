# `maat verify`

Verify or revoke a probabilistic finding that was flagged with `[Verify]`.

```bash
maat verify --fingerprint <fingerprint>
maat verify --fingerprint <fingerprint> --revoke
maat verify --fingerprint <fingerprint> --reason "Confirmed by architecture review"
maat --config ./path/to/maat.config.ts verify --fingerprint <fingerprint>
```

## What it does

`maat verify` appends a `finding.verified` event to the ledger for the given fingerprint. This is the human-in-the-loop step that converts a probabilistic finding into a trusted, deterministic one.

When the kernel produces a finding that depends on enriched facts, it marks the finding with `requiresVerification: true`. These findings:

- Display a `[Verify]` badge in CLI output
- Never break strict builds
- Never go to the ledger via `maat check --ledger`

After `maat verify`, the finding is treated as deterministic on subsequent runs.

## Verification lifecycle

```
Kernel produces finding from enriched fact
    ↓
CLI shows [Verify] badge
    ↓
Human reviews finding and runs `maat verify --fingerprint <fp>`
    ↓
Ledger records `finding.verified` event
    ↓
Next run: CLI sees verified fingerprint, clears `requiresVerification`
    ↓
Finding is now treated as deterministic
```

## Revocation

If a verification was made in error, or the enriched fact is no longer valid:

```bash
maat verify --fingerprint <fingerprint> --revoke
```

This appends a `finding.revoked` event to the ledger. The finding regains `requiresVerification: true` on subsequent runs.

## Options

| Option | Purpose |
|---|---|
| `--fingerprint <fp>` | **Required.** The fingerprint of the finding to verify or revoke. |
| `--revoke` | Revoke a previous verification instead of creating one. |
| `--reason <text>` | Optional human-readable reason for the verification or revocation. |

## Ledger requirement

`maat verify` requires a configured ledger. Without one, the command exits with an error.

## Why this exists

Enrichers produce probabilistic facts. Rules consuming those facts produce findings that carry uncertainty. The system does not auto-approve these findings because:

- A probabilistic model may hallucinate or misinterpret.
- The same code run twice through an LLM may produce different enriched facts.
- Build-breaking findings must be trustworthy.

Human verification is the explicit trust boundary. A verified finding is a decision that a human has reviewed the probabilistic output and accepted it as valid for this codebase.

## Related

- [Enrichers](/guide/enrichers)
- [ADR-011: Enrichers — Probabilistic Facts Without Breaking Determinism](/adr/011-enrichers-probabilistic-facts)
- [`maat check`](/commands/check)
