---
layout: page
pageClass: maat-home
---

<section class="maat-hero">
  <div class="maat-hero-copy">
    <p class="maat-kicker">Static architecture checks for codebases</p>
    <h1>Maat checks architecture rules against your repository.</h1>
    <p class="maat-lead">
      Define boundaries, run checks, and keep a record of the exceptions you accepted.
    </p>
    <div class="maat-actions">
      <a class="maat-button maat-button-primary" href="/guide/getting-started">Read the guide</a>
      <a class="maat-button" href="https://github.com/maat-tools/maat">View source</a>
    </div>
  </div>
  <div class="maat-hero-art" aria-label="maat balance icon">
    <img src="/maat.png" alt="" />
  </div>
</section>

<section class="maat-note">
  <p>
    Maat is not a framework, an AI reviewer, or a diagram generator. It is a small tool for checking whether the structure of a repository still matches the rules written for it.
  </p>
</section>

## Why this exists

<section class="maat-panel">
  <p>
    Architecture rules are often written in places the compiler cannot see: planning docs, ADRs, review comments, diagrams, and conversations.
  </p>
  <p>
    Maat moves part of that intent into executable rules. It checks package and layer relationships, reports violations, and records decisions in a ledger that lives with the repository.
  </p>
  <p>
    It does not decide whether the architecture is good. It reports rule violations and keeps accepted exceptions in version control.
  </p>
</section>

## New and existing codebases

<div class="maat-adoption">
  <section>
    <p class="maat-mode">Greenfield</p>
    <h3>Write the rules before the shortcuts settle in.</h3>
    <p>New systems can encode package boundaries, layer rules, and purity constraints from the first commit. `maat check` can run locally and in CI.</p>
    <ul>
      <li>Prevent accidental dependencies before they become precedent.</li>
      <li>Keep domain code independent from infrastructure and framework details.</li>
      <li>Review architecture rules as code.</li>
    </ul>
  </section>
  <section>
    <p class="maat-mode">Brownfield</p>
    <h3>Add checks without pretending the codebase is clean.</h3>
    <p>Existing systems can baseline known violations, keep them visible, and promote only the findings the team is ready to enforce.</p>
    <ul>
      <li>Separate new violations from existing debt.</li>
      <li>Track accepted exceptions with author, timestamp, and rationale.</li>
      <li>Turn repeated review comments into checks.</li>
    </ul>
  </section>
</div>

## Design choices

<div class="maat-grid">
  <section>
    <h3>Deterministic checks</h3>
    <p>Same repository state, same findings. No hidden state, no randomness, no LLM judgment inside the gate.</p>
  </section>
  <section>
    <h3>File-based history</h3>
    <p>The ledger records findings and state changes in a file that can be committed with the codebase.</p>
  </section>
  <section>
    <h3>Incremental adoption</h3>
    <p>The tool should work before the codebase is clean. Existing violations can be baselined, promoted, enforced, or resolved over time.</p>
  </section>
</div>

## What happens when it runs

<div class="maat-flow" aria-label="what maat does when it runs">
  <div>
    <strong>Read code</strong>
    <span>Collectors turn repository structure into facts.</span>
  </div>
  <div>
    <strong>Check rules</strong>
    <span>Rules compare those facts with the configured boundaries.</span>
  </div>
  <div>
    <strong>Report findings</strong>
    <span>Violations are shown with stable fingerprints.</span>
  </div>
  <div>
    <strong>Update ledger</strong>
    <span>Accepted findings and decisions are stored with the repository.</span>
  </div>
</div>

## Configuration example

Maat currently ships with a TypeScript collector. Collectors are separate from the kernel, so other languages can be added by implementing the collector interface.

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

## Manual claims

```bash
maat axiom declare \
  --id "domain-purity" \
  --scope "@myapp/domain" \
  --claim "The domain layer has no infrastructure dependencies." \
  --note "Keeps the domain testable without spinning up real I/O."
```

## Status

<section class="maat-panel">
  <p>
    Maat is pre-1.0. The CLI can run checks, sync findings with the ledger, and move decisions through baseline, promote, enforce, and resolve flows.
  </p>
  <p>
    The model is stable enough to inspect and experiment with, but package APIs can still change while the collector and rule interfaces settle.
  </p>
</section>

<footer class="maat-footer">
  <span>Released under the Apache-2.0 License.</span>
  <a href="https://github.com/maat-tools/maat">GitHub</a>
</footer>
