# Fitness functions

Maat rules implement the **fitness function** concept from [*Building Evolutionary Architectures*](https://www.oreilly.com/library/view/building-evolutionary-architectures/9781492097532/) (Neal Ford, Rebecca Parsons, Patrick Kua, Pramod Sadalage): automated checks that verify how well a system adheres to its intended architectural characteristics.

This page explains how Maat maps to that model and how to use fitness functions to guide your codebase's evolution.

## What is a fitness function

A fitness function is an objective check that measures some aspect of a system's architecture. The term comes from evolutionary algorithms, where fitness functions score how well a candidate solution meets its goals. In software architecture, they answer questions like:

- Does the domain layer depend on infrastructure?
- Are package boundaries respected?
- Is high-churn code isolated from stable code?
- Do duplicated policies across modules stay consistent?

Fitness functions make architectural intent explicit and verifiable. They replace "we should not do that" with "the check fails when we do that."

## How Maat implements fitness functions

Maat's architecture maps directly to the fitness function pattern:

| Fitness function concept | Maat equivalent |
|---|---|
| **Characteristic to protect** | The architectural policy you encode in a rule |
| **Measurement** | Collectors gather facts from the repository |
| **Evaluation** | Rules compare facts against the policy |
| **Score / result** | Findings with stable fingerprints |
| **Guided evolution** | Adding and refining rules over time |

The flow is deterministic: the same collected facts and rule version always produce the same findings. There is no randomness, hidden state, or LLM judgment in the check path.

## Types of fitness functions in Maat

Maat ships with several categories of rules that serve as fitness functions for different architectural concerns.

### Structural fitness functions

These check the shape and boundaries of your codebase:

- **Package boundaries**: which modules may import from which others
- **Layer purity**: whether a layer depends only on allowed layers
- **Dependency direction**: whether the dependency graph flows in the intended direction

```ts
import { layer } from '@maat-tools/coupling-rules'
import { Pure } from '@maat-tools/coupling-rules/roles'

layer('@myapp/domain').is(Pure).allows('@myapp/contracts')
layer('@myapp/infra').allows('@myapp/domain', '@myapp/contracts')
```

### Churn fitness functions

These check whether frequently changing code is properly isolated:

- **High-churn detection**: files that change too often within a time window
- **Erosion detection**: boundaries that have both violations and high churn

```ts
// via @maat-tools/git-rules and @maat-tools/insights
```

### Semantic fitness functions

These check meaning-level coupling across boundaries:

- **Connascence of Meaning**: duplicated logic that must change together across packages

```ts
// via @maat-tools/connascence-rules
```

### Manual fitness functions (axioms)

Some architectural claims are not yet automated. Use axioms to record them in the ledger so the team can revisit them later and potentially turn them into automated rules:

```bash
maat axiom declare \
  --id "domain-purity" \
  --scope "@myapp/domain" \
  --claim "The domain layer has no infrastructure dependencies." \
  --note "Keeps the domain testable without spinning up real I/O."
```

## Guiding evolution with fitness functions

The evolutionary architecture model treats fitness functions as guardrails, not gates that must all pass from day one. Maat supports this through its ledger and lifecycle commands.

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

Maat's plugin system lets you write collectors and rules for codebase-specific concerns. A custom collector gathers facts your codebase needs; a custom rule evaluates those facts against your policy.

Read the [plugin guide](./plugins.md) for details on writing custom collectors and rules.

## Comparison with other approaches

| Approach | How it works | Maat difference |
|---|---|---|
| Architecture unit tests | Pass/fail checks embedded in test suites | Maat adds lifecycle: baselining, resolving, and ledger history |
| Manual code review | Human judgment at PR time | Maat makes repeated review comments into deterministic checks |
| Diagrams and ADRs | Documentation of intended architecture | Maat verifies whether the code still matches the intent |
| Linters | Local syntax and style checks | Maat checks cross-cutting architectural facts from multiple sources |

## Further reading

- [*Building Evolutionary Architectures*](https://www.oreilly.com/library/view/building-evolutionary-architectures/9781492097532/) by Neal Ford, Rebecca Parsons, Patrick Kua, and Pramod Sadalage
- [Getting started](./getting-started.md)
- [Adoption guide](./adoption.md)
- [Plugin system](./plugins.md)
- [Determinism guarantee](./determinism.md)
