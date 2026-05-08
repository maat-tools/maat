# Commands

Each command has its own collapsible reference so this page can grow without turning into a wall of options.

::: details `maat check` — Run configured collectors and rules
Scans the codebase and prints architectural findings. With a ledger configured, `maat check` can also compare current findings against prior decisions.

```bash
maat check
maat check --ledger
maat check --show-baselined
maat check --silent
```

| Option | Purpose |
|---|---|
| `--ledger` | Save current findings to the configured ledger. |
| `--show-baselined` | Include baselined findings in output and exit code evaluation. |
| `--silent` | Suppress console output while preserving the command exit code. |

When `check.strict` is enabled, the command exits with failure if visible findings remain.
:::

::: details `maat axiom declare` — Add a manual claim to the ledger
Records a human-authored architectural claim. Axioms can also cover specific finding fingerprints so known exceptions stay explicit.

```bash
maat axiom declare \
  --id stable-boundary \
  --scope packages/core \
  --claim "Core must not import CLI code"
```

| Option | Purpose |
|---|---|
| `--id <id>` | Stable slug identifying the axiom. |
| `--scope <scope>` | Architectural scope the axiom applies to. |
| `--claim <claim>` | Invariant being asserted. |
| `--note <note>` | Optional rationale or references. |
| `--fingerprints <fingerprints>` | Comma-separated finding fingerprints covered by the axiom. |
| `--force` | Re-declare even if the axiom id already exists. |
:::

::: details `maat axiom supersede` — Replace an axiom with a newer decision
Marks an active axiom as superseded while keeping its history in the ledger.

```bash
maat axiom supersede --id stable-boundary --reason "Replaced by plugin-boundary"
```

| Option | Purpose |
|---|---|
| `--id <id>` | Axiom id to supersede. |
| `--reason <reason>` | Optional explanation for supersession. |
:::

::: details `maat axiom revoke` — Revoke an axiom that no longer applies
Marks an active axiom as revoked while preserving the original declaration.

```bash
maat axiom revoke --id stable-boundary --reason "Boundary no longer exists"
```

| Option | Purpose |
|---|---|
| `--id <id>` | Axiom id to revoke. |
| `--reason <reason>` | Optional explanation for revocation. |
:::

::: details `maat baseline` — Accept current findings as the starting point
Baselines all currently observed findings so future `maat check` output focuses on new or active issues.

```bash
maat baseline
```

Requires a configured ledger.
:::

::: details `maat promote` — Mark a finding as reviewed
Promotes an observed finding to acknowledged. Add `--enforce` to make future `maat check` runs fail while that finding is still detected.

```bash
maat promote --fingerprint <fingerprint>
maat promote --fingerprint <fingerprint> --enforce
```

| Option | Purpose |
|---|---|
| `--fingerprint <fingerprint>` | Fingerprint of the finding to promote. |
| `--enforce` | Escalate the finding to an enforced gate. |
:::

::: details `maat resolve` — Mark a promoted or enforced finding as fixed
Confirms that a promoted or enforced finding has been intentionally resolved.

```bash
maat resolve --fingerprint <fingerprint>
```

| Option | Purpose |
|---|---|
| `--fingerprint <fingerprint>` | Fingerprint of the finding to resolve. |
:::

::: details `maat visualize` — Print current ledger state
Displays findings, axioms, and optional insights from the configured ledger.

```bash
maat visualize
maat visualize --filter observed,promoted
maat visualize --insights
maat visualize --json
```

| Option | Purpose |
|---|---|
| `--filter <states>` | Comma-separated groups to show: `observed`, `baselined`, `promoted`, `enforced`. |
| `--no-axioms` | Hide declared axioms. |
| `--insights` | Run insights against the current ledger state. |
| `--json` | Output as JSON. |
:::
