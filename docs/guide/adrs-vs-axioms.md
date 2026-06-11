# ADRs vs Axioms

maat uses both ADRs and axioms to capture architecture knowledge, but they serve different purposes.

## ADRs: the decision record

An **Architecture Decision Record** captures the full context of a decision:

- **Why** the decision was made
- **What alternatives** were considered
- **What consequences** the decision has

ADRs are documentation. They are consulted when someone asks "why is it built this way?" or when a team needs to revisit a past decision.

Example: [ADR-003: Event-sourced append-only ledger](/adr/003-event-sourced-ndjson-ledger) explains why NDJSON was chosen over a database, what the tradeoffs are, and what consequences follow.

## Axioms: the assertion

An **axiom** is a manual claim recorded in the ledger. It states:

- **What** the team asserts to be true about the system
- **Where** it applies (scope)
- **Why** (optional note, often referencing an ADR)

Axioms are not documentation — they are living entries in the ledger. They travel with the repository, can be superseded or revoked, and rules may check whether the codebase still honors them.

## When to use which

| Situation | Use |
|---|---|
| Recording why a technical choice was made | ADR |
| Comparing alternatives and their tradeoffs | ADR |
| Asserting an architectural invariant the team agrees on | Axiom |
| Recording a manual exception or rule that cannot be automated yet | Axiom |
| Explaining consequences and future considerations | ADR |
| Declaring something that should be checked (now or later) by a rule | Axiom |

## Relationship

An ADR and an axiom often come in pairs:

1. **Write the ADR** to capture the decision, context, and reasoning
2. **Declare an axiom** to assert the decision as a living claim in the ledger

The axiom references the ADR in its `note` field for traceability. The ADR stands on its own as documentation.

### Example

**ADR-006** records the full decision: kernel must be pure, no I/O, why this matters, what the consequences are.

The corresponding **axiom** is a single claim:

```bash
maat axiom declare \
  --id pure-kernel \
  --scope kernel \
  --claim "Kernel and all rules are pure with no I/O" \
  --note "ADR-006: pure kernel with no I/O"
```

The axiom does not replace the ADR. It distills the decision into an assertion that lives in the ledger.

## Axioms do not replace ADRs

Axioms are not a substitute for ADRs. An axiom is a distilled assertion — it carries no context, no alternatives, no reasoning. If you only write an axiom without an ADR, the next person (or future you) will not know why the decision was made or what tradeoffs were considered.

**Do not skip the ADR.** Write the ADR first to capture the decision. Then declare an axiom if you want that decision to live in the ledger as a tracked claim.

## Axioms do not require rules

An axiom is a standalone declaration. A rule may check whether the codebase honors it, but there is no required coupling:

- You can declare an axiom today and write a rule for it later
- You can declare an axiom that no rule will ever check — it is still a recorded team assertion
- A rule can check something that has no corresponding axiom

The axiom says "this is what we believe." A rule says "this is how we check it." They are independent.
