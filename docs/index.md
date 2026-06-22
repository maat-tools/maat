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
    <h1>Linters check lines. maat checks the agreements your team made about the codebase.</h1>
    <p class="maat-lead">
      Write your team's architecture rules as code, check them on every run, and keep a committed history of every violation and every decision made about it.
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

<section class="maat-demo">
  <p class="maat-kicker">See it in action</p>
  <p>
    maat finding a real layer violation in Cal.com's codebase: config → findings → the file that breaks the rule.
  </p>
  <img :src="withBase('/calcom-maat-demo.gif')" alt="maat finding a layer violation in Cal.com" />
</section>

<section class="maat-note">
  <p>
    maat is not a linter, a code grader, or an AI reviewer. Linters tells you a line breaks a style rule. SonarQube gives your code a score. maat answers a different question: is the codebase still keeping the promises your team made about it — and if not, since when?
  </p>
</section>

## Why this exists

<section class="maat-panel">
  <p>
    Every team has rules that no linter knows about. <em>The domain layer never talks to the database directly. These two modules must not know about each other. This policy is implemented in one place only.</em> Those rules live in code review comments, onboarding chats, and a few people's heads — and they erode quietly, one reasonable-looking PR at a time.
  </p>
  <p>
    Most teams living with a hard-to-change codebase share the same picture: the same kinds of bugs keep coming back, the time goes to firefighting, and nobody asks why — that's just how work feels. When someone finally reviews the architecture by hand, they find the reasons: rules everyone had silently agreed on, broken little by little over years, where every individual change looked fine. And the review usually fails anyway — not because it's wrong, but because it arrives without evidence: no way to show when each rule started slipping, how fast, or what it's costing.
  </p>
  <p>
    maat is that review, automated, with the receipts built in. It asks the question a good tech lead carries in their head — on every commit, with a paper trail.
  </p>
</section>

## The problems linters can't see

<section class="maat-panel">
  <p>
    The hardest coupling isn't in import graphs. It's in the things that have to stay in agreement without saying so: the same business policy implemented in three slightly different copies, a data shape shared between modules that read it with incompatible assumptions, two functions that must change together but live far apart.
  </p>
  <p>
    These problems are invisible to linters, type checkers, and unit tests, because every individual line is fine. Types compile. Tests pass. The damage accumulates silently — bugs that keep coming back, data nobody can explain, gaps that surface months later.
  </p>
  <p>
    maat makes these problems detectable. Collectors read plain facts from your code and git history. When a fact needs reading rather than parsing — like noticing that two functions implement the same policy differently — AI-assisted enrichers can extract it. But AI never gets a vote: boring, repeatable rules decide what counts as a violation. AI for reading. Rules for guarantees.
  </p>
</section>

## New and existing codebases

<div class="maat-adoption">
  <section>
    <p class="maat-mode">Greenfield</p>
    <h3>Write the rules before the shortcuts settle in.</h3>
    <p>New systems can encode package boundaries, layer rules, and purity constraints from the first commit. <code>maat check</code> fails the pull request before an accidental dependency becomes precedent.</p>
    <ul>
      <li>Prevent accidental dependencies before they become normal.</li>
      <li>Keep domain code independent from infrastructure and framework details.</li>
      <li>Review architecture rules as code.</li>
    </ul>
  </section>
  <section>
    <p class="maat-mode">Brownfield</p>
    <h3>Start from what the codebase already taught you.</h3>
    <p>The first run on a mature codebase will find things. That's expected, and none of it counts against anyone — maat separates new violations from existing debt, so you can adopt rules without first fixing years of history.</p>
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

<section class="maat-panel">
  <p>
    Backend codebases with real business logic, layers, and module boundaries — the bigger and older, the more maat has to say. Frontend projects tend to have less business logic encoded in structure, so a linter or type-checker often covers the same ground. If your frontend has complex state machines, domain models, or cross-module contracts, maat can still help.
  </p>
</section>

## Design choices

<div class="maat-grid">
  <section>
    <h3>Boring on purpose</h3>
    <p>Same facts in, same findings out. No hidden state, no randomness, no network calls, no AI judgment anywhere in the check path.</p>
  </section>
  <section>
    <h3>History lives with the code</h3>
    <p>Findings and decisions are recorded in a plain file (the ledger) committed with the repository. maat stores the decision; git history stores who made it. Context survives when people leave — it's about memory, not blame.</p>
  </section>
  <section>
    <h3>Adoptable before the codebase is clean</h3>
    <p>Existing violations can be accepted for a limited time or marked as fixed. Accepted exceptions expire and force a revisit — there is no permanent "ignore".</p>
  </section>
</div>

<section class="maat-note">
  <p>
    Official rules from the <code>maat-tools/maat</code> repository carry the repeatability guarantee. Third-party plugins are supported through the same public interfaces, but their behavior is the responsibility of the package author and the team that installs them.
  </p>
</section>

<p class="maat-adoption-more">
  Read more about <a :href="withBase('/guide/determinism.html')">the repeatability guarantee</a> and <a :href="withBase('/guide/plugins.html')">the plugin system</a>.
</p>

## What happens when it runs

<div class="maat-flow" aria-label="what maat does when it runs">
  <div>
    <strong>Collect facts</strong>
    <span>Collectors read plain facts from the repository: which files import which, what lives in which layer, what changes together in git history.</span>
  </div>
  <div>
    <strong>Check rules</strong>
    <span>Rules compare those facts against the agreements your team chose to encode. Same facts in, same findings out.</span>
  </div>
  <div>
    <strong>Report findings</strong>
    <span>Each finding gets a stable ID, so the same problem stays the same problem across commits and renames. Findings based on AI-extracted facts are flagged for human verification.</span>
  </div>
  <div>
    <strong>Update the ledger</strong>
    <span>Decisions — accepted for now, fixed, declared — are stored in a file committed with the repository, so they travel with the code they describe.</span>
  </div>
</div>

## Configuration example

<section class="maat-panel">
  <p>
    maat ships with a TypeScript collector and built-in rules for package and layer boundaries. Teams can add their own collectors, enrichers, and rules for codebase-specific problems.
  </p>
  <p>
    The CLI is just the runner — collectors, enrichers, rules, insights, and ledger backends are separate packages you install per project based on what you need:
  </p>
</section>

```bash
npm install -D @maat-tools/cli @maat-tools/core @maat-tools/collector-ts @maat-tools/coupling-rules
```

```ts
import { defineConfig } from '@maat-tools/core'
import { layer, Pure } from '@maat-tools/coupling-rules'

export default defineConfig({
  check: { strict: true },
  collectors: [['@maat-tools/collector-ts', { tsConfigFilePath: './tsconfig.json' }]],
  rules: [
    // "Business logic stays free of databases, HTTP, and frameworks."
    layer('@myapp/domain').is(Pure).build(),
    // "Infrastructure may use the domain and shared contracts. Nothing else."
    layer('@myapp/infra').allows('@myapp/domain', '@myapp/contracts').build(),
  ],
})
```

## Agreements a machine can't check yet

<section class="maat-panel">
  <p>
    Some agreements can't be verified by a collector or rule yet. Write them down anyway, so they're versioned and visible instead of tribal:
  </p>
</section>

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
    If you've read <a href="https://www.oreilly.com/library/view/building-evolutionary-architectures/9781492097532/"><em>Building Evolutionary Architectures</em></a> (Ford, Parsons, Kua, Sadalage), maat rules are fitness functions: automated checks that measure how well a system adheres to its intended architectural characteristics. You don't need the book to use maat — but if you have that vocabulary, this is where maat sits.
  </p>
</section>

<p class="maat-adoption-more">
  <a :href="withBase('/guide/fitness-functions.html')">Read more about how maat implements fitness functions</a>
</p>

## FAQ

<div class="maat-faq">
  <section>
    <h3>Is maat a linter?</h3>
    <p>No. Linters check local syntax, style, or common code patterns — one file at a time. maat is for rules that need facts from more than one place in the repository, including its history.</p>
  </section>
  <section>
    <h3>How is it different from dependency rules?</h3>
    <p>Dependency rules are one use case. maat can express package and layer boundaries, but rules can run over any fact a collector provides — including facts from git history and AI-assisted reading of the code.</p>
  </section>
  <section>
    <h3>How is it different from architecture unit tests?</h3>
    <p>Architecture tests pass or fail at one point in time. maat adds memory: existing findings can be accepted for a limited time, fixed ones are marked resolved, and the exact same problem coming back is caught as a regression — not rediscovered as something new.</p>
  </section>
  <section>
    <h3>Does AI decide what's a violation?</h3>
    <p>Never. AI-assisted enrichers can extract facts that need reading rather than parsing — like two functions implementing the same policy differently. But the rules that judge those facts are plain, repeatable code, and findings based on AI-extracted facts are flagged for human verification.</p>
  </section>
  <section>
    <h3>Can we write our own checks?</h3>
    <p>Yes. maat is built around plugins: collectors gather facts, rules evaluate them, and the same public interfaces the official packages use are available to yours.</p>
  </section>
</div>

## Status

<section class="maat-panel">
  <p>
    maat is pre-1.0. The CLI can run checks, sync findings with the ledger, and move decisions through baseline and resolve flows.
  </p>
  <p>
    The model is stable enough to inspect and experiment with, but package APIs can still change while the collector and rule interfaces settle.
  </p>
</section>

<footer class="maat-footer">
  <span>Released under the Apache-2.0 License.</span>
  <a href="https://github.com/maat-tools/maat">GitHub</a>
</footer>
