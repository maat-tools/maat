---
layout: page
pageClass: maat-home
---

<script setup>
import { withBase } from 'vitepress'
</script>

<section class="maat-hero">
  <div class="maat-hero-copy">
    <p class="maat-kicker">Architecture checks for large codebases</p>
    <h1>Turn implicit architecture knowledge into deterministic checks.</h1>
    <p class="maat-lead">
      Maat helps teams capture the coupling, boundaries, and codebase rules that usually live in a few developers' heads.
    </p>
    <div class="maat-actions">
      <a class="maat-button maat-button-primary" :href="withBase('/guide/getting-started.html')">Read the guide</a>
      <a class="maat-button" href="https://github.com/maat-tools/maat">View source</a>
    </div>
  </div>
  <div class="maat-hero-art" aria-label="maat balance icon">
    <img :src="withBase('/maat.png')" alt="" />
  </div>
</section>

<section class="maat-note">
  <p>
    Maat is not a linter, an AI reviewer, or a diagram generator. It is a way to turn architectural observations into collectors, deterministic rules, and a ledger of explicit decisions about findings.
  </p>
</section>

## Why this exists

<section class="maat-panel">
  <p>
    Large codebases collect rules that are hard to see from one file: which modules may talk to each other, which data shapes are public, which duplicated policies must stay consistent, and which shortcuts have become dangerous.
  </p>
  <p>
    Those rules often live in review comments, ADRs, debugging sessions, and the memory of people who know the codebase well. Maat gives teams a path to make that knowledge explicit.
  </p>
  <p>
    A team can write collectors for the facts its codebase needs, write rules for the policies it cares about, and keep the accepted exceptions in version control.
  </p>
</section>

## The invisible coupling

<section class="maat-panel">
  <p>
    The hardest coupling isn't in import graphs. It's in semantic patterns: multiple code paths executing the same domain operation with different invariants, shared data structures carrying incompatible assumptions across bounded contexts, configuration surfaces that govern the same action from disconnected panels.
  </p>
  <p>
    These patterns are invisible to linters, type checkers, SAST, and unit tests. Each function works correctly in isolation. Types compile. Tests pass. The damage accumulates silently — orphaned data, broken audit trails, compliance gaps that surface months later.
  </p>
  <p>
    Maat was born to make these patterns detectable. The direction is clear: specialized collectors (including LLM-assisted ones) gather semantic facts from code, comments, and commit history. Deterministic rules check those facts against policies the team chooses to encode. LLMs for gathering judgment. Rules for guarantees.
  </p>
</section>

## New and existing codebases

<div class="maat-adoption">
  <section>
    <p class="maat-mode">Greenfield</p>
    <h3>Write the rules before the shortcuts settle in.</h3>
    <p>New systems can encode package boundaries, layer rules, and purity constraints from the first commit. <code>maat check</code> fails the pull request before active findings become normal ledger state.</p>
    <ul>
      <li>Prevent accidental dependencies before they become precedent.</li>
      <li>Keep domain code independent from infrastructure and framework details.</li>
      <li>Review architecture rules as code.</li>
    </ul>
  </section>
  <section>
    <p class="maat-mode">Brownfield</p>
    <h3>Start from what the codebase already taught you.</h3>
    <p>Existing systems can turn repeated review notes and manual architecture analysis into checks, baseline existing findings in dedicated ledger PRs, and keep fixed fingerprints from quietly regressing.</p>
    <ul>
      <li>Separate new violations from existing debt.</li>
      <li>Track accepted exceptions in the same repository history as the code.</li>
      <li>Turn repeated review comments into checks.</li>
    </ul>
  </section>
</div>

<p class="maat-adoption-more">
  <a :href="withBase('/guide/adoption.html')">Read more about greenfield and brownfield workflows</a>
</p>

## Who benefits most

Maat is most useful for backend repositories with meaningful domain logic, layered architectures, and multiple bounded contexts. Frontend projects tend to have less business logic encoded in structure — a linter or type-checker often covers the same ground. If your frontend has complex state machines, domain models, or cross-module contracts, Maat can still help.

## Design choices

<div class="maat-grid">
  <section>
    <h3>Deterministic analysis</h3>
    <p>Same collected facts, same findings. No hidden state, no randomness, no LLM judgment inside the gate.</p>
  </section>
  <section>
    <h3>File-based history</h3>
    <p>The ledger records findings and state changes in a file that can be committed with the codebase. Maat stores the decision; repository history stores who made it.</p>
  </section>
  <section>
    <h3>Incremental adoption</h3>
    <p>The tool should work before the codebase is clean. Existing violations can be baselined or resolved over time.</p>
  </section>
</div>

<section class="maat-note">
  <p>
    Official rules from the <code>maat-tools/maat</code> repository are deterministic by guarantee. Third-party plugins are supported through public interfaces, but their behavior is the responsibility of the package author and the team that installs them.
  </p>
</section>

<p class="maat-adoption-more">
  Read more about <a :href="withBase('/guide/determinism.html')">the determinism guarantee</a> and <a :href="withBase('/guide/plugins.html')">the plugin system</a>.
</p>

## What happens when it runs

<div class="maat-flow" aria-label="what maat does when it runs">
  <div>
    <strong>Collect facts</strong>
    <span>Collectors turn repository structure, metadata, or team-specific signals into facts.</span>
  </div>
  <div>
    <strong>Check rules</strong>
    <span>Rules compare those facts with the policies the team chose to encode.</span>
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

Maat ships with a TypeScript collector and built-in rules for package and layer boundaries. Teams can add their own collectors and rules for codebase-specific problems.

The CLI is just the runner — collectors, rules, insights, and ledger backends are separate packages you install per project based on what you need:

```bash
npm install -D @maat-tools/cli @maat-tools/core @maat-tools/collector-ts @maat-tools/coupling-rules
```

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

## Fitness functions

<section class="maat-panel">
  <p>
    Maat rules implement the fitness function concept from <a href="https://www.oreilly.com/library/view/building-evolutionary-architectures/9781492097532/"><em>Building Evolutionary Architectures</em></a> (Ford, Parsons, Kua, Sadalage): automated checks that measure how well a system adheres to its intended architectural characteristics.
  </p>
  <p>
    Each rule evaluates collected facts against a policy the team chose to encode. When a rule fails, the finding signals that the codebase is drifting from the shape the team wants to preserve. Over time, adding and refining rules guides the architecture's evolution in a deliberate direction.
  </p>
</section>

<p class="maat-adoption-more">
  <a :href="withBase('/guide/fitness-functions.html')">Read more about how Maat implements fitness functions</a>
</p>

## FAQ

<div class="maat-faq">
  <section>
    <h3>Is Maat a linter?</h3>
    <p>No. Linters usually check local syntax, style, or common code patterns. Maat is for architecture rules that need facts from more than one place in the repository.</p>
  </section>
  <section>
    <h3>How is it different from dependency rules?</h3>
    <p>Dependency rules are one use case. Maat can express package and layer boundaries, but the collector model is broader: rules can run over any fact type a collector provides.</p>
  </section>
  <section>
    <h3>How is it different from architecture unit tests?</h3>
    <p>Architecture tests usually pass or fail at one point in time. Maat adds lifecycle: baseline existing findings and mark fixed fingerprints as resolved so exact regressions are caught later.</p>
  </section>
  <section>
    <h3>Are Maat rules fitness functions?</h3>
    <p>Yes. In the vocabulary of <a href="https://www.oreilly.com/library/view/building-evolutionary-architectures/9781492097532/"><em>Building Evolutionary Architectures</em></a> (Ford, Parsons, Kua, Sadalage), Maat rules are fitness functions: automated, objective checks that verify architectural characteristics. Collectors gather the facts, rules evaluate them, and findings report deviations from the desired shape.</p>
  </section>
  <section>
    <h3>Can we write our own checks?</h3>
    <p>Yes. Maat is built around plugins: collectors gather facts, rules evaluate them, and the kernel keeps the check path deterministic.</p>
  </section>
</div>

## Status

<section class="maat-panel">
  <p>
    Maat is pre-1.0. The CLI can run checks, sync findings with the ledger, and move decisions through baseline and resolve flows.
  </p>
  <p>
    The model is stable enough to inspect and experiment with, but package APIs can still change while the collector and rule interfaces settle.
  </p>
</section>

<footer class="maat-footer">
  <span>Released under the Apache-2.0 License.</span>
  <a href="https://github.com/maat-tools/maat">GitHub</a>
</footer>
