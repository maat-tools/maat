# Fitness functions

maat rules implement the **fitness function** concept from [*Building Evolutionary Architectures*](https://www.oreilly.com/library/view/building-evolutionary-architectures/9781492097532/) (Neal Ford, Rebecca Parsons, Patrick Kua, Pramod Sadalage): automated checks that verify how well a system adheres to its intended architectural characteristics.

This page explains how maat maps to that model and how to use fitness functions to guide your codebase's evolution.

## What is a fitness function

A fitness function is an objective check that measures some aspect of a system's architecture. The term comes from evolutionary algorithms, where fitness functions score how well a candidate solution meets its goals. In software architecture, they answer questions like:

- Does the domain layer depend on infrastructure?
- Are package boundaries respected?
- Is high-churn code isolated from stable code?
- Do duplicated policies across modules stay consistent?

Fitness functions make architectural intent explicit and verifiable. They replace "we should not do that" with "the check fails when we do that."

## How maat implements fitness functions

maat's architecture maps directly to the fitness function pattern:

| Fitness function concept | maat equivalent |
|---|---|
| **Characteristic to protect** | The architectural policy you encode in a rule |
| **Measurement** | Collectors gather facts from the repository |
| **Evaluation** | Rules compare facts against the policy |
| **Score / result** | Findings with stable fingerprints |
| **Guided evolution** | Adding and refining rules over time |

The evaluation is deterministic at the rule layer: the same collected facts and rule version always produce the same findings, with no randomness, hidden state, or LLM judgment in rule evaluation. When [enrichers](./enrichers.md) are configured, LLM calls can run during `maat check` to produce additional facts; findings that depend on those facts are explicitly flagged as requiring human verification. See the [determinism guarantee](./determinism.md) for the exact boundary.

## Dimensions of fitness functions

maat rules can express checks across multiple dimensions of your codebase. Each dimension captures a different kind of architectural concern:

### Structure

Checks that verify the shape of your codebase — which parts may talk to which others, and whether boundaries are respected.

Examples: package boundaries, layer purity, dependency direction, circular dependency prevention.

### Time

Checks that verify how your codebase changes over time — whether frequently modified code is properly isolated, whether boundaries are eroding.

Examples: high-churn detection, erosion signals, temporal coupling between modules.

### Meaning

Checks that verify semantic coupling — whether modules are connected by shared meaning rather than explicit imports.

Examples: connascence of meaning, duplicated policies across boundaries, implicit contracts that must stay synchronized.

### Intent

Claims the team asserts about the architecture but hasn't automated yet. Axioms record these in the ledger so they can be revisited and eventually turned into structural, temporal, or semantic checks.

```bash
maat axiom declare \
  --id "domain-purity" \
  --scope "@myapp/domain" \
  --claim "The domain layer has no infrastructure dependencies." \
  --note "Keeps the domain testable without spinning up real I/O."
```

Each dimension answers a different question: **structure** asks "can these parts talk?", **time** asks "are these parts changing together?", **meaning** asks "do these parts understand each other the same way?", and **intent** asks "what do we believe about this system that isn't checked yet?"

## Guiding evolution with fitness functions

The evolutionary architecture model treats fitness functions as guardrails, not gates that must all pass from day one. maat supports this through its ledger and lifecycle commands.

### Start with what matters most

Pick the 2-3 architectural characteristics that would cause the most pain if they degraded. Write rules for those first. Common starting points:

- Package or module boundaries
- Layer dependency direction
- Domain isolation from infrastructure

### Baseline existing debt

On an existing codebase, the first run will likely surface many findings. Use the ledger to record them and baseline them as a starting point:

```bash
maat check --ledger
maat baseline
```

Baselines expire, so old debt does not become invisible forever. This forces periodic review and gradual improvement.

### Add rules as patterns emerge

When the team notices a repeated pattern in code review, or a bug that could have been prevented by a check, add a new rule. Each new rule is a new fitness function that guides the codebase's evolution.

### Resolve fixed findings

When a finding is fixed, mark it as resolved so regressions are caught:

```bash
maat resolve --fingerprint <fingerprint>
```

Resolved findings are fingerprint-specific. If the same rule fires on a different code location, it is a new finding.

## Writing custom fitness functions

maat's plugin system lets you write collectors and rules for codebase-specific concerns. A custom collector gathers facts your codebase needs; a custom rule evaluates those facts against your policy.

Read the [plugin guide](./plugins.md) for details on writing custom collectors and rules.

## Comparison with other approaches

| Approach | How it works | maat difference |
|---|---|---|
| Architecture unit tests | Pass/fail checks embedded in test suites | maat adds lifecycle: baselining, resolving, and ledger history |
| Manual code review | Human judgment at PR time | maat makes repeated review comments into deterministic checks |
| Diagrams and ADRs | Documentation of intended architecture | maat verifies whether the code still matches the intent |
| Linters | Local syntax and style checks | maat checks cross-cutting architectural facts from multiple sources |

## Further reading

- [*Building Evolutionary Architectures*](https://www.oreilly.com/library/view/building-evolutionary-architectures/9781492097532/) by Neal Ford, Rebecca Parsons, Patrick Kua, and Pramod Sadalage
- [Getting started](./getting-started.md)
- [Adoption guide](./adoption.md)
- [Plugin system](./plugins.md)
- [Determinism guarantee](./determinism.md)
