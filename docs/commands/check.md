# `maat check`

Runs configured collectors and rules, prints current findings, and evaluates exit conditions.

```bash
maat check
maat check --ledger
maat check --show insights
maat check --show findings
maat check --show-baselined
maat check --silent

# With a custom config file:
maat --config ./path/to/maat.config.ts check
maat -c ./maat.config.ts check --ledger
```

## What it does

Without a ledger, `maat check` reports whatever the kernel finds in the current repository state. If `check.strict` is enabled, any finding that does not require verification makes the command fail; `[Verify]` findings never break builds.

With a ledger configured, `maat check` compares current findings against recorded decisions:

- unexpired baselines are hidden from normal output;
- active axioms can hide covered fingerprints;
- resolved findings that reappear are treated as regressions.

Rules always run against current repository facts. The ledger is applied after rules finish.

Insights run after that over all current findings from the same check, including current findings that are hidden from normal output because they are baselined or covered by an active axiom. This is intentional: a baseline suppresses enforcement, but it is still architectural debt and can matter for summaries, prioritization, and erosion-style analysis. Insights are read-only and do not affect the check exit code.

When configured insights run and `--show` is `all`, `maat check` prints a warning that they analyze all current findings, including findings hidden by baselines or active axiom exceptions. With `--show findings` or `--show insights`, the warning is not printed.

`--show-baselined` still only changes the current check output. It unhides all reconciled findings present in this run — baselined, axiom-excepted, and revoked; it does not print findings that exist only in the ledger and no longer appear in the current repository state. Use `maat visualize` when you need to inspect ledger state.

## Recording findings

`--ledger` appends events to the configured ledger:

- `finding.observed` for active findings present in this run;
- `finding.unverified` for new probabilistic findings (those marked `requiresVerification`) that have not been verified yet;
- `finding.resolved` for previously observed, unbaselined findings that no longer appear in the current run.

```bash
maat check --ledger
```

Use this before `maat baseline` or `maat resolve`; both commands need the fingerprint to already exist in the ledger.

## Options

| Option | Purpose |
|---|---|
| `--ledger` | Save current findings to the configured ledger. |
| `--show <mode>` | Choose output sections: `all` (default), `findings`, or `insights`. This only controls printed sections; exit behavior and ledger writes are unchanged. |
| `--show-baselined` | Include all reconciled findings from the current run — baselined, axiom-excepted, and revoked — in output and exit code evaluation. Requires a configured ledger. |
| `--silent` | Suppress console output while preserving the command exit code. |

## Exit behavior

`maat check` exits non-zero when:

- a resolved fingerprint reappears;
- a baseline has expired;
- `check.strict` is enabled and visible findings that do not require verification remain;
- `--ledger` is passed but no ledger is configured;
- `--show-baselined` is passed but no ledger is configured;
- `--show` receives a value other than `all`, `findings`, or `insights`.
