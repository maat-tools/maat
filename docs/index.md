---
layout: page
pageClass: maat-home
---

<script setup>
import { withBase } from 'vitepress'
</script>

<section class="maat-hero">
  <div class="maat-hero-copy">
    <h1>Check that your code follows<br><em>your team's rules.</em></h1>
    <p class="maat-lead">Maat checks the rules you define for your project, keeps a history of your decisions, and warns when rules are broken or resolved problems return.</p>
    <div class="maat-actions">
      <a class="maat-button maat-button-primary" href="#how-it-works">See how it works <span aria-hidden="true">↘</span></a>
      <a class="maat-text-link" href="#adoption">For new and existing codebases <span aria-hidden="true">→</span></a>
    </div>
    <p class="maat-small">For software built by people, AI agents, or both.</p>
  </div>
  <div class="maat-hero-art" aria-hidden="true">
    <img :src="withBase('/maat.png')" alt="" width="768" height="768" />
  </div>
</section>

<div class="maat-principles">
  <span>Your rules, checked consistently</span>
  <span>Decisions versioned with your code</span>
  <span>Human review for AI findings</span>
</div>

<section class="maat-example" id="how-it-works" aria-labelledby="regression-title">
  <div class="maat-example-header"><span>A resolved problem returns</span><span>Illustrative example</span></div>
  <div class="maat-example-content">
    <div>
      <h2 id="regression-title">Get a warning when a resolved problem returns.</h2>
      <p>If a rule detects a dependency that was marked as resolved in the ledger, Maat reports a regression and the check fails.</p>
    </div>
    <div class="maat-event">
      <code>maat check</code><br>
      <strong>Regression detected</strong><br>
      <code>domain → database</code><br>
      <code>Previously marked as resolved.</code>
    </div>
  </div>
</section>

<section class="maat-section" aria-labelledby="rules-title">
  <p class="maat-kicker">Configured checks</p>
  <h2 id="rules-title">Define the rules your project needs.</h2>
  <p class="maat-section-lead">You might keep business logic separate from database access, limit dependencies between packages, or check which files change together. Maat checks the rules you configure each time you run it; those checks cover the constraints you encode.</p>
  <div class="maat-grid">
    <section>
      <span class="maat-number" aria-hidden="true">01</span>
      <h3>Configure a rule</h3>
      <p>Choose collectors and rules for your repository. Collectors gather facts from code or Git history; rules check those facts against your constraints.</p>
    </section>
    <section>
      <span class="maat-number" aria-hidden="true">02</span>
      <h3>Review the findings</h3>
      <p>Inspect what the rule found and the evidence behind it. Findings based on probabilistic facts, including AI-extracted facts, require human verification.</p>
    </section>
    <section>
      <span class="maat-number" aria-hidden="true">03</span>
      <h3>Keep checking over time</h3>
      <p>Run checks locally or in CI. With a ledger, Maat can track accepted exceptions and detect the return of a finding recorded as resolved.</p>
    </section>
  </div>
  <a class="maat-text-link" :href="withBase('/guide/getting-started.html')">Set up your first check <span aria-hidden="true">→</span></a>
</section>

<section class="maat-section maat-ledger" aria-labelledby="ledger-title">
  <div>
    <p class="maat-kicker">The ledger</p>
    <h2 id="ledger-title">Keep the reasons behind your decisions with the code.</h2>
    <p>Maat records findings, resolutions, temporary exceptions, and declared decisions in a ledger file. You can commit that file to Git alongside the code; Maat does not commit it for you.</p>
    <p>A written decision preserves context. To enforce it automatically, you also need a configured rule that can check it.</p>
    <a class="maat-text-link" :href="withBase('/plugins/file-ledger/')">Read about the ledger <span aria-hidden="true">→</span></a>
  </div>
  <aside class="maat-review" aria-labelledby="review-title">
    <h3 id="review-title">Human review for probabilistic findings</h3>
    <p>AI-assisted enrichers can extract facts for rules to evaluate. Findings based on those facts require human verification. If a resolved probabilistic finding returns, that regression can fail the check while verification is still pending.</p>
    <a class="maat-text-link" :href="withBase('/commands/verify.html')">How verification works <span aria-hidden="true">→</span></a>
  </aside>
</section>

<section class="maat-section" id="adoption" aria-labelledby="adoption-title">
  <p class="maat-kicker">Adoption</p>
  <h2 id="adoption-title">Use it in new and existing codebases.</h2>
  <div class="maat-adoption">
    <section>
      <h3>Starting a project</h3>
      <p>Configure boundaries and other checks as you build. The same rules apply whether a person or an AI agent writes the next change.</p>
    </section>
    <section>
      <h3>Working with existing code</h3>
      <p>Review the first findings and record exceptions you accept for a limited time. You can adopt checks without fixing every existing finding first. Exceptions expire and need to be revisited.</p>
    </section>
  </div>
  <a class="maat-text-link" :href="withBase('/guide/adoption.html')">Read the adoption guide <span aria-hidden="true">→</span></a>
</section>

<section class="maat-section maat-demo" aria-labelledby="demo-title">
  <p class="maat-kicker">In a real codebase</p>
  <h2 id="demo-title">Checking dependencies in Cal.com</h2>
  <p>The recording shows a configured layer rule, the dependencies it flags, and the source file behind a finding.</p>
  <img :src="withBase('/calcom-maat-demo.gif')" alt="Terminal recording of Maat reporting dependencies forbidden by a configured layer rule in Cal.com, then opening the source file." width="1400" height="850" loading="lazy" />
</section>

<section class="maat-section maat-status" aria-labelledby="status-title">
  <div>
    <p class="maat-kicker">Pre-1.0</p>
    <h2 id="status-title">Available now and planned for later</h2>
    <p>Today, Maat runs configured checks, records decisions, supports temporary exceptions and human verification, and detects returning findings. Package APIs may still change before 1.0.</p>
    <h3 id="future-direction">Future direction</h3>
    <p>We’re exploring how Maat could connect technical evidence to delivery and business risk, helping teams understand what a finding could mean beyond the code. This is research, not a capability available today.</p>
  </div>
  <a class="maat-button maat-button-primary" :href="withBase('/guide/getting-started.html')">Read the guide <span aria-hidden="true">→</span></a>
</section>

<footer class="maat-footer">
  <span>Open source · Apache-2.0</span>
  <a href="https://github.com/maat-tools/maat">View source on GitHub <span aria-hidden="true">↗</span></a>
</footer>
