# Commands

| Command | Purpose |
|---|---|
| `maat check` | Run configured collectors and rules. `--ledger` syncs findings with the ledger. |
| `maat axiom declare` | Add a manual claim to the ledger. |
| `maat axiom supersede` | Mark an axiom as replaced by a newer one. |
| `maat axiom revoke` | Revoke an axiom that no longer applies. |
| `maat baseline` | Accept current findings as the starting point. |
| `maat promote` | Mark a finding as reviewed. `--enforce` makes it fail future checks. |
| `maat resolve` | Mark a promoted or enforced finding as fixed. |
| `maat visualize` | Print current ledger state: findings, axioms, insights. |
