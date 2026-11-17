# Commands

maat commands are split between two workflows:

| Workflow | Commands | Purpose |
|---|---|---|
| Finding workflow | [`check`](./check), [`baseline`](./baseline), [`resolve`](./resolve), [`verify`](./verify), [`visualize`](./visualize) | Run rules, record findings, decide what to suppress, resolve, verify, or inspect. |
| Axioms | [`axiom declare`](./axiom-declare), [`axiom supersede`](./axiom-supersede), [`axiom revoke`](./axiom-revoke) | Record and maintain manual architecture claims that are not automated findings. |

## Finding decisions

A finding is a current rule result. A fingerprint is its stable identity across runs. The ledger stores decisions about fingerprints.

| Decision | Meaning | Check behavior |
|---|---|---|
| `observed` | maat saw the finding and saved it. | Visible unless baselined, covered by an active axiom, or revoked. |
| `baselined` | Temporarily accepted as existing debt. | Hidden from check output until expiry; inspect recorded baselines with `maat visualize --filter baselined`. |
| `resolved` | This exact fingerprint was intentionally fixed. | If the same fingerprint appears again later, maat treats it as a regression. |
| `unverified` | A probabilistic finding recorded by `check --ledger`, awaiting human review. | Shown with a `[Verify]` badge; does not fail strict mode on its own. A resolved fingerprint that returns fails as a regression, even pending verification. |
| `revoked` | A human dismissed an unverified finding as a false positive (`verify --revoke`). | Hidden from output even if the finding still appears in the current run. |

There is no `verified` decision state. `maat verify` records human acceptance as `finding.observed`. In the current implementation, later scans still carry `requiresVerification` when the kernel produces enriched findings; `check` does not clear the flag based on that ledger event. Verification alone therefore does not remove the `[Verify]` badge or make these findings fail strict mode. Returning resolved fingerprints still fail as regressions. Human acceptance does not make the model deterministic.

The most important nuance: `resolved` applies to one finding fingerprint, not to the whole rule. If `abc123` is resolved for a domain-to-infra import, only `abc123` is protected as a regression. Another finding from the same rule gets its own fingerprint and starts as a new finding.
