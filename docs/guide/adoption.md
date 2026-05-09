# Greenfield and brownfield adoption

Maat works in both new and existing codebases, but the ledger does not have the same job in both places.

In a greenfield codebase, the main value is early enforcement. You usually run `maat check` as a gate and fix violations in the same pull request that introduced them. The ledger should have no active findings most of the time, except for rare reviewed exceptions or manual axioms.

In a brownfield codebase, the ledger is central. It lets the team record today's architectural debt, keep it visible, baseline it for a limited time, and distinguish old findings from new regressions. Even there, regular pull requests should normally run `maat check` only. Ledger updates should be intentional maintenance work.

## Greenfield workflow

Start without a ledger unless the team already needs explicit exceptions.

```ts
import { defineConfig } from '@maat-tools/core'
import { layer } from '@maat-tools/coupling-rules'
import { Pure } from '@maat-tools/coupling-rules/roles'

export default defineConfig({
  check: { strict: true },
  collectors: [['@maat-tools/collector-ts', { tsConfigFilePath: './tsconfig.json' }]],
  rules: [
    layer('@myapp/domain').is(Pure).allows('@myapp/contracts'),
    layer('@myapp/infra').allows('@myapp/domain', '@myapp/contracts'),
  ],
})
```

Run the same command locally and in CI:

```bash
maat check
```

Use this when a rule should be enforced from the start. A new architecture violation fails the command immediately, so the author fixes the architecture issue before the pull request merges. Because violations do not survive the pull request, there is no debt history to manage.

## Greenfield with recorded decisions

Add a ledger when a new codebase has a decision worth versioning.

```ts
export default defineConfig({
  check: { strict: true },
  collectors: [['@maat-tools/collector-ts', { tsConfigFilePath: './tsconfig.json' }]],
  rules: [
    layer('@myapp/domain').is(Pure).allows('@myapp/contracts'),
    layer('@myapp/infra').allows('@myapp/domain', '@myapp/contracts'),
  ],
  ledger: ['@maat-tools/file-ledger', { path: './maat-ledger.ndjson' }],
})
```

Good greenfield uses for the ledger:

- Record a reviewed exception with `maat axiom declare`.
- Resolve a fixed fingerprint so the same violation is treated as a regression later.
- Keep architectural claims next to the code before an automated rule exists.

Bad greenfield use for the ledger:

- Updating the ledger on every pull request.
- Baselining new violations so a feature branch can merge.
- Treating the ledger as the normal place where active findings live.

Example: record a temporary exception for a known integration shortcut.

```bash
maat check --ledger
maat axiom declare \
  --id billing-domain-temporary-adapter \
  --scope @myapp/domain \
  --claim "The billing domain may import the legacy adapter until the payment split is complete." \
  --fingerprints abc123 \
  --note "Remove after the payment package owns the adapter."
```

Open a dedicated ledger pull request for this kind of decision. A maintainer should update the ledger, explain the exception, and keep that review separate from feature code. CI can keep running `maat check`; the configured ledger is still read, but CI does not append new events.

## Brownfield workflow

Existing codebases often have valid rules and existing violations at the same time. The goal is to stop new damage without pretending all old damage can be fixed in one pass.

Add a ledger, run an initial collection, and baseline the current findings:

```bash
maat check --ledger
maat baseline --expires-in 30
```

Commit `maat-ledger.ndjson` with a dedicated adoption pull request. That commit becomes the record of what the team accepted temporarily.

After that, use this split:

- CI runs `maat check` to fail on visible findings, expired baselines, and resolved fingerprints that reappear.
- Maintainers run `maat check --ledger` only in intentional ledger maintenance work.
- Maintainers run `maat baseline --expires-in <days>` in a dedicated ledger pull request when the team accepts existing debt for a limited window.
- Maintainers run `maat resolve --fingerprint <fingerprint>` in a dedicated ledger pull request when a stored finding was intentionally fixed.

## Pull request rule of thumb

Most pull requests should run only:

```bash
maat check
```

Do not update the ledger from ordinary feature, fix, or refactor pull requests. The ledger is shared architectural state, so changing it should be a visible decision with a small review surface.

Do not put `maat check --ledger`, `maat baseline`, `maat resolve`, or `maat axiom declare` in a pull request workflow. A pull request workflow should prove whether the proposed code still satisfies the recorded architecture decisions; it should not rewrite those decisions while evaluating the code.

Use a separate maintainer-owned pull request when the repository needs to:

- add the first baseline for an existing codebase;
- extend or renew a baseline after review;
- record a temporary exception with an axiom;
- mark a stored finding as resolved;
- update the ledger after a rule or fingerprint definition intentionally changed.

This keeps normal pull requests honest: if `maat check` fails, the author either fixes the code or asks for a separate architecture decision.

## Brownfield pull request examples

When a pull request introduces a new violation, CI should fail:

```bash
maat check
```

Fix the code if the violation is accidental. If the violation is an intentional temporary exception, do not update the ledger inside the same feature pull request. Ask a maintainer to open a separate ledger pull request:

```bash
maat check --ledger
maat baseline --expires-in 14
```

That ledger pull request should include the reason in the commit or review.

When a pull request fixes old debt, merge the code fix first. Then a maintainer can mark that fingerprint as resolved in a separate ledger pull request:

```bash
maat resolve --fingerprint <fingerprint>
```

From then on, if the same fingerprint appears again, `maat check` treats it as a regression.

When the team has architectural knowledge that is not automated yet, record it as an axiom:

```bash
maat axiom declare \
  --id domain-does-not-call-database \
  --scope @myapp/domain \
  --claim "Domain services must not call database clients directly." \
  --note "Automate this with a collector once database clients are tagged."
```

This does not replace a rule. It keeps the decision reviewable until the team can automate it.

## Choosing the first rule

For greenfield, start with rules that should be true forever:

- package boundaries;
- dependency direction;
- pure domain layers;
- public contract packages.

For brownfield, start with rules that match repeated review comments:

- imports from a layer that should be private;
- direct use of infrastructure in domain code;
- cross-package dependencies that should go through a contract;
- duplicated constants or policies that must stay synchronized.

The first useful rule is not the most complete one. It is the rule the team can explain, run, and act on.
