# Commands

Maat commands are split between two workflows:

| Workflow | Commands | Purpose |
|---|---|---|
| Finding workflow | [`check`](./check), [`baseline`](./baseline), [`resolve`](./resolve), [`visualize`](./visualize) | Run rules, record findings, decide what to suppress, resolve, or inspect. |
| Axioms | [`axiom declare`](./axiom-declare), [`axiom supersede`](./axiom-supersede), [`axiom revoke`](./axiom-revoke) | Record and maintain manual architecture claims that are not automated findings. |

## Finding decisions

A finding is a current rule result. A fingerprint is its stable identity across runs. The ledger stores decisions about fingerprints.

| Decision | Meaning | Check behavior |
|---|---|---|
| `observed` | Maat saw the finding and saved it. | Visible unless baselined or covered by an active axiom. |
| `baselined` | Temporarily accepted as existing debt. | Hidden until expiry unless `--show-baselined` is used. |
| `resolved` | This exact fingerprint was intentionally fixed. | If the same fingerprint appears again later, Maat treats it as a regression. |

The most important nuance: `resolved` applies to one finding fingerprint, not to the whole rule. If `abc123` is resolved for a domain-to-infra import, only `abc123` is protected as a regression. Another finding from the same rule gets its own fingerprint and starts as a new finding.
