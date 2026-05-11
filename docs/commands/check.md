# `maat check`

Runs configured collectors and rules, prints current findings, and evaluates exit conditions.

```bash
maat check
maat check --ledger
maat check --show-baselined
maat check --silent
```

## What it does

Without a ledger, `maat check` reports whatever the kernel finds in the current repository state. If `check.strict` is enabled, any finding makes the command fail.

With a ledger configured, `maat check` compares current findings against recorded decisions:

- unexpired baselines are hidden from normal output;
- active axioms can hide covered fingerprints;
- resolved findings that reappear are treated as regressions.

Rules always run against current repository facts. The ledger is applied after rules finish.

Insights run after that over all current findings from the same check, including current findings that are hidden from normal output because they are baselined or covered by an active axiom. This is intentional: a baseline suppresses enforcement, but it is still architectural debt and can matter for summaries, prioritization, and erosion-style analysis. Insights are read-only and do not affect the check exit code.

When configured insights run, `maat check` prints a warning that they analyze all current findings, including findings hidden by baselines or active axiom exceptions.

## Recording findings

`--ledger` appends new observed findings to the configured ledger.

```bash
maat check --ledger
```

Use this before `maat baseline` or `maat resolve`; both commands need the fingerprint to already exist in the ledger.

## Options

| Option | Purpose |
|---|---|
| `--ledger` | Save current findings to the configured ledger. |
| `--show-baselined` | Include baselined findings in output and exit code evaluation. |
| `--silent` | Suppress console output while preserving the command exit code. |

## Exit behavior

`maat check` exits non-zero when:

- a resolved fingerprint reappears;
- a baseline has expired;
- `check.strict` is enabled and visible findings remain.
