# `maat check`

Runs the configured collectors, optional enrichers, and rules, prints the current findings, and evaluates exit conditions. When a ledger is configured it also reconciles those findings against the decisions recorded in the ledger; `--ledger` additionally records new ledger events.

```bash
maat check
maat check --ledger
maat check --silent
maat check --no-cache

# With a custom config file:
maat --config ./path/to/maat.config.ts check
maat -c ./path/to/maat.config.ts check --ledger
```

## What it does

Rules always run against the current repository facts. What happens next depends on whether a ledger is configured.

### When no ledger is configured

`maat check` reports whatever the kernel finds in the current repository state.

- If `check.strict` is enabled (the default), any finding that does not require verification fails the command.
- `[Verify]` findings (those marked `requiresVerification`) never break the build.
- When there are no findings it prints `No findings detected. Great job!`; otherwise it prints how many findings were detected.

### When a ledger is configured

`maat check` **reconciles** the current findings against the recorded decisions — whether or not `--ledger` is passed. Reconciliation affects both output and exit code:

- unexpired baselines are hidden from output;
- revoked findings that reappear are hidden from output;
- findings recorded as `resolved` that reappear are treated as **regressions** (shown and failing);
- expired baselines fail the command;
- probabilistic `[Verify]` findings are tracked separately and do not fail strict mode on their own. If a resolved fingerprint reappears, it still fails as a regression pending verification.

Without `--ledger`, this reconciliation is **read-only**: the ledger is consulted but no events are written. Pass `--ledger` to also record events (see below).

## Recording findings

`--ledger` records new events to the configured ledger after reconciliation. It appends:

- `finding.observed` — for new findings that do not require verification, including a **regression**: a finding previously recorded as `resolved` that reappears. A regression also fails the command (see [Exit behavior](#exit-behavior)); re-recording it as `observed` instead of leaving it `resolved` is what lets you act on it again — address it, or accept it with `maat baseline` — rather than it staying stuck.
- `finding.unverified` — for new findings requiring verification, including resolved fingerprints that return with `requiresVerification`. Returning probabilistic findings fail as regressions in that run.
- `finding.resolved` — for any previously recorded finding that no longer appears in the current run. This includes observed and unverified findings, **and baselined findings whose underlying finding has disappeared** (whether the baseline was still active or already expired) — they are auto-resolved instead of lingering until the baseline expires.

```bash
maat check --ledger
```

### First run

On a fresh ledger, the first `maat check --ledger` records deterministic findings as `observed` and findings requiring human review as `unverified`. In strict mode, visible findings that do not require verification still fail the command; recording them does not accept them. When those findings remain, `check` reminds you to run [`maat baseline`](baseline.md). Baselining the recorded findings makes the current state your starting point; subsequent checks then pass while still enforcing anything new.

## Options

| Option | Purpose |
|---|---|
| `--ledger` | Record findings to the configured ledger. Reconciliation against the ledger happens automatically when one is configured; this flag controls **writing**. Errors if no ledger is configured. |
| `--silent` | Suppress normal console output while preserving the exit code. Configuration errors (such as `--ledger` without a configured ledger) are still reported. |
| `--no-cache` | Bypass the enricher cache and force all configured enrichers to re-run. Useful when you suspect cached enriched facts are stale or want to reproduce an issue without committing the cache. Has no effect when no enrichers are configured. |

## Exit behavior

`maat check` exits non-zero when:

- a resolved finding reappears (regression);
- a resolved probabilistic finding reappears (regression to verify);
- a baseline has expired, even if its finding has disappeared. With `--ledger`, automatic resolution clears that missing finding for the next run; the current run still fails;
- `check.strict` is enabled and visible findings that do not require verification remain;
- `--ledger` is passed but no ledger is configured;
- the configuration registers no collectors or no rules (reported as `No collectors configured.` / `No rules configured.`).

Regressions and expired baselines are broken promises: they fail the command **regardless of `check.strict`**, even in non-strict mode. The regression and expired-baseline errors name each offending fingerprint and message (and, for regressions, the recorded resolution reason when available) so they can be located quickly.
