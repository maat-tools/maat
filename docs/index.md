---
layout: page
pageClass: maat-home
---

<script setup>
import { withBase } from 'vitepress'
</script>

<section class="maat-hero">
  <div class="maat-hero-copy">
    <p class="maat-kicker">Fact-based architecture analysis for codebases</p>
    <h1>Maat checks architecture rules against facts collected from your repository.</h1>
    <p class="maat-lead">
      Collect structural and semantic facts, run deterministic rules, and keep accepted exceptions in version control.
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
    Maat is not a linter, an AI reviewer, or a diagram generator. It is a collector-based analysis tool: collectors extract facts from a repository, rules evaluate those facts, and the ledger records what was accepted.
  </p>
</section>

## Why this exists

<section class="maat-panel">
  <p>
    Architecture rules are often written in places the compiler cannot see: planning docs, ADRs, review comments, diagrams, and conversations.
  </p>
  <p>
    Maat moves part of that intent into executable rules. Today it ships with a TypeScript collector for source structure. The same model can support other collectors, including semantic ones, without changing the kernel.
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
    <h3>Deterministic analysis</h3>
    <p>Same collected facts, same findings. No hidden state, no randomness, no LLM judgment inside the gate.</p>
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

<section class="maat-note">
  <p>
    Official rules from the <code>maat-tools/maat</code> repository are deterministic by guarantee. Third-party plugins are supported through public interfaces, but their behavior is the responsibility of the package author and the team that installs them.
  </p>
  <p>
    Read more about <a :href="withBase('/guide/determinism.html')">the determinism guarantee</a> and <a :href="withBase('/guide/plugins.html')">the plugin system</a>.
  </p>
</section>

## What happens when it runs

<div class="maat-flow" aria-label="what maat does when it runs">
  <div>
    <strong>Collect facts</strong>
    <span>Collectors turn repository structure, metadata, or other inputs into facts.</span>
  </div>
  <div>
    <strong>Check rules</strong>
    <span>Rules compare collected facts with the configured boundaries.</span>
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

Maat currently ships with a TypeScript collector. Collectors are separate from the kernel, so other languages and semantic sources can be added by implementing the collector interface.

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

## FAQ

<div class="maat-faq">
  <section>
    <h3>Is Maat a linter?</h3>
    <p>No. Linters usually check local syntax, style, or code patterns. Maat checks facts collected from the repository against architecture rules, then records accepted findings in a ledger.</p>
  </section>
  <section>
    <h3>How is it different from dependency rules?</h3>
    <p>Dependency rules are one input. Maat can express package and layer boundaries, but the collector model is broader: rules can run over any fact type a collector provides.</p>
  </section>
  <section>
    <h3>How is it different from architecture unit tests?</h3>
    <p>Architecture tests usually pass or fail at one point in time. Maat adds lifecycle: baseline existing findings, promote reviewed findings, enforce selected rules, and resolve fixed ones.</p>
  </section>
  <section>
    <h3>Is this a fitness function tool?</h3>
    <p>It can be used that way. A Maat rule is a deterministic fitness function over collected facts, with ledger support for adoption and history.</p>
  </section>
</div>

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
