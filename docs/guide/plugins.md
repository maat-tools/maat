# Plugin system

Maat plugins are packages that implement one of the public extension interfaces:

| Plugin type | Purpose |
|---|---|
| Collector | Read a repository or external source and return facts |
| Enricher | Consume facts and produce new facts (probabilistic interpretation) |
| Rule | Evaluate facts and return findings |
| Insight | Analyze findings and return derived observations |
| Ledger backend | Persist finding and axiom history |

Plugins are regular packages with a default export created by one of the helpers from `@maat-tools/contracts`.

## Determinism contract

Third-party plugins are not covered by Maat's official determinism guarantee. Plugin authors must honor the contract documented in [Determinism](/guide/determinism).

The short version:

- Rules and insights must be synchronous and pure.
- Collectors may perform I/O, but must produce deterministic facts for the same inputs.
- Ledger backends may perform I/O, but must preserve the events they are asked to append.

## Enricher

An enricher consumes facts and produces new facts. Unlike a collector, it does not read the filesystem or network. Unlike a rule, it does not produce findings. Its sole purpose is to derive higher-level facts from lower-level ones.

**All enrichers are probabilistic by definition.** They interpret, synthesize, or infer. If a transformation is deterministic, it belongs in a collector, a rule, or an insight.

When a rule consumes facts produced by an enricher, the resulting finding is marked with `requiresVerification: true`. These findings display a `[Verify]` badge, never break strict builds, and never go to the ledger until a human verifies them.

```ts
import { type Enricher, defineEnricher, type FactRegistry } from '@maat-tools/contracts'

export type SemanticSimilarity = {
  functionA: string
  functionB: string
  reason: string
}

export class SemanticSimilarityEnricher
  implements Enricher<'acme.ts.functions', 'acme.semantic.similarity'>
{
  readonly id = 'acme.semantic-similarity'
  readonly needFacts = ['acme.ts.functions'] as const
  readonly provideFacts = ['acme.semantic.similarity'] as const

  async enrich(facts: { 'acme.ts.functions': unknown[] }): Promise<{
    'acme.semantic.similarity': SemanticSimilarity[]
  }> {
    // Use an LLM or other probabilistic model to identify semantic patterns
    return { 'acme.semantic.similarity': [] }
  }
}

declare module '@maat-tools/contracts' {
  interface FactRegistry {
    'acme.semantic.similarity': SemanticSimilarity[]
  }
}

export default defineEnricher(() => new SemanticSimilarityEnricher())
```

See the [Enrichers guide](/guide/enrichers) for the full documentation, including tradeoffs, verification workflow, and determinism implications.

## Collector

A collector provides facts to the kernel.

```ts
import { type Collector, defineCollector, type FactRegistry } from '@maat-tools/contracts'

export type PythonImportFact = {
  file: string
  sourceModule: string
  importedModule: string
}

export type PythonImportCollectorOptions = {
  root: string
}

function collectPythonImports(root: string): PythonImportFact[] {
  // Parse Python files under root and return deterministic, project-relative facts.
  return []
}

export class PythonImportCollector implements Collector<'acme.python.imports'> {
  // The collector id appears in diagnostics and should stay stable across releases.
  readonly id = 'acme.python-imports'

  // provideFacts tells the kernel which fact keys this collector returns.
  readonly provideFacts = ['acme.python.imports'] as const

  constructor(private readonly options: PythonImportCollectorOptions) {}

  async collect(): Promise<Pick<FactRegistry, 'acme.python.imports'>> {
    return {
      'acme.python.imports': collectPythonImports(this.options.root),
    }
  }
}

// Extend Maat's registries so TypeScript knows about your custom fact key
// and config entry. This is what gives users autocomplete and option checking
// inside defineConfig().
declare module '@maat-tools/contracts' {
  interface FactRegistry {
    'acme.python.imports': PythonImportFact[]
  }

  interface CollectorRegistry {
    '@acme/maat-collector-python-imports': PythonImportCollectorOptions
  }
}

export default defineCollector((options: PythonImportCollectorOptions) => new PythonImportCollector(options))
```

Use collectors for parsing source files, reading package metadata, loading generated manifests, or adapting another deterministic source into Maat facts.

## Rule

A rule reads facts and returns findings. It must not perform I/O.

```ts
import {
  type Artifact,
  defineRule,
  type FindingRuleOutput,
  type Rule,
} from '@maat-tools/contracts'
import { RuleBase } from '@maat-tools/core'

type PythonImportFact = {
  file: string
  sourceModule: string
  importedModule: string
}

type BoundaryViolationArtifact = PythonImportFact & {
  sourceLayer: string
  forbiddenLayer: string
}

export type PythonBoundaryRuleOptions = {
  forbiddenImports: {
    sourceLayer: string
    forbiddenLayer: string
  }[]
}

function belongsToLayer(moduleName: string, layer: string): boolean {
  return moduleName === layer || moduleName.startsWith(`${layer}.`)
}

export class PythonBoundaryRule extends RuleBase implements Rule<'acme.python.imports'> {
  // Keep rule ids stable. Ledger entries and finding fingerprints include this id.
  readonly id = 'acme.python-boundaries'

  // needFacts declares which collected facts must exist before this rule can run.
  readonly needFacts = ['acme.python.imports'] as const

  constructor(private readonly options: PythonBoundaryRuleOptions) {
    super()
  }

  evaluate(facts: { 'acme.python.imports': PythonImportFact[] }): FindingRuleOutput[] {
    const findings: FindingRuleOutput[] = []

    for (const imp of facts['acme.python.imports']) {
      for (const boundary of this.options.forbiddenImports) {
        if (!belongsToLayer(imp.sourceModule, boundary.sourceLayer)) {
          continue
        }
        if (!belongsToLayer(imp.importedModule, boundary.forbiddenLayer)) {
          continue
        }

        const artifact: BoundaryViolationArtifact = { ...imp, ...boundary }

        findings.push({
          ruleId: this.id,
          // ruleIdentifier is the stable identity of this finding.
          // Include durable facts such as package, exported symbol,
          // dependency specifier, architectural scope, or project-relative file path
          // when the location is part of the identity. Avoid volatile fields such as
          // line, column, timestamps, absolute temp paths, or formatted messages.
          // The kernel hashes ruleId + ruleIdentifier to produce the fingerprint.
          ruleIdentifier: {
            sourceModule: imp.sourceModule,
            importedModule: imp.importedModule,
            sourceLayer: boundary.sourceLayer,
            forbiddenLayer: boundary.forbiddenLayer,
          },
          message: `${imp.sourceModule} imports ${imp.importedModule}, crossing ${boundary.sourceLayer} -> ${boundary.forbiddenLayer}`,
          artifacts: [{ kind: 'python-boundary-violation', data: artifact }],
        })
      }
    }

    return findings
  }

  // describeArtifact converts artifact data into human-readable fields for output.
  // It does not participate in fingerprint generation.
  describeArtifact(artifact: Artifact): Record<string, string> {
    const violation = artifact.data as BoundaryViolationArtifact
    return {
      file: violation.file,
      import: `${violation.sourceModule} -> ${violation.importedModule}`,
      boundary: `${violation.sourceLayer} -> ${violation.forbiddenLayer}`,
    }
  }
}

// Register the rule package id and its options type for defineConfig() autocomplete.
declare module '@maat-tools/contracts' {
  interface RuleRegistry {
    '@acme/maat-rule-python-boundaries': PythonBoundaryRuleOptions
  }
}

export default defineRule((options: PythonBoundaryRuleOptions) => new PythonBoundaryRule(options))
```

Findings should use stable identifiers. The `ruleIdentifier` should describe the architectural fact that makes the finding the same finding across runs. Good inputs include package names, import specifiers, route paths, exported symbols, rule scopes, normalized configuration values, and project-relative file paths when the file location is part of the fact being checked.

Avoid values that change when the underlying architectural fact did not change: line numbers, columns, timestamps, absolute temporary paths, stack traces, formatted messages, or raw object dumps from tools that do not guarantee stable shape.

Maat does not track file renames as a separate ledger operation. If a fingerprint includes `file`, renaming the file produces a new fingerprint and the old finding can later be resolved. If a rename should not create a new finding, keep the file path in `artifacts` for display and use a more durable identifier, such as package, symbol, route path, dependency specifier, or architectural scope.

The kernel generates each fingerprint with `generateFingerprint(ruleId, ruleIdentifier)`, which uses a stable stringify before hashing. Object property order does not matter: `{ file, path }` and `{ path, file }` hash the same way. See [ADR-008](/adr/008-fingerprint-based-finding-identity) for the full design.

Array order still matters because arrays represent ordered data. If a collector reads files or facts in nondeterministic order, sort them before returning facts or before including them in `ruleIdentifier`.

`describeArtifact()` is separate from the fingerprint path. Use it for display fields, not identity. If a rule changes its `ruleIdentifier` inputs between releases, existing ledger decisions may no longer match future findings.

## Insight

An insight analyzes findings after rules run.

Unlike a rule, an insight does not evaluate raw facts and does not decide whether the check passes. It reads the findings that already exist and explains a larger pattern across them.

During `maat check`, insights analyze all current findings from that run, including findings that are hidden from normal output because they are baselined or covered by an active axiom. Baselined findings are suppressed for enforcement, but they remain part of the current architecture. Resolved findings that are no longer present in the current scan are not included in this input.

```ts
import { defineInsight, type Finding, type Insight, type InsightResult } from '@maat-tools/contracts'

type BoundaryViolationArtifact = {
  file: string
  sourceModule: string
  importedModule: string
  sourceLayer: string
  forbiddenLayer: string
}

export type RepeatedBoundaryPatternOptions = {
  threshold: number
}

function boundaryKey(violation: BoundaryViolationArtifact): string {
  return `${violation.sourceLayer} -> ${violation.forbiddenLayer}`
}

export class RepeatedBoundaryPatternInsight implements Insight {
  // Insight ids appear in CLI output and should stay stable across releases.
  readonly id = 'acme.repeated-boundary-pattern'

  // needRules lets the insight declare which rule findings it expects to analyze.
  readonly needRules = ['acme.python-boundaries'] as const

  constructor(private readonly options: RepeatedBoundaryPatternOptions) {}

  analyze(findings: Finding[]): InsightResult[] {
    const byBoundary = new Map<string, Set<string>>()

    for (const finding of findings) {
      if (finding.ruleId !== 'acme.python-boundaries') {
        continue
      }

      for (const artifact of finding.artifacts) {
        if (artifact.kind !== 'python-boundary-violation') {
          continue
        }

        const violation = artifact.data as BoundaryViolationArtifact
        const files = byBoundary.get(boundaryKey(violation)) ?? new Set<string>()
        files.add(violation.file)
        byBoundary.set(boundaryKey(violation), files)
      }
    }

    return [...byBoundary.entries()]
      .filter(([, files]) => files.size >= this.options.threshold)
      .map(([boundary, files]) => ({
        insightId: this.id,
        message: `The same boundary violation appears in ${files.size} files: ${boundary}.`,
        data: { boundary, files: [...files].sort() },
      }))
  }
}

// Register the insight package id and options type for defineConfig() autocomplete.
declare module '@maat-tools/contracts' {
  interface InsightRegistry {
    '@acme/maat-insight-repeated-boundary-pattern': RepeatedBoundaryPatternOptions
  }
}

export default defineInsight((options = { threshold: 3 }) => new RepeatedBoundaryPatternInsight(options))
```

Use insights for summaries, grouping, prioritization, and reporting. In this example, the rule reports each forbidden import. The insight explains when the same boundary crossing appears repeatedly, which suggests a recurring architectural pattern rather than a one-off exception. Do not use insights to decide whether a check passes.

## Ledger backend

A ledger backend persists events and derives the current ledger state by folding them.

Official ledger backends preserve append-only history. The current file ledger writes NDJSON events by appending lines and derives state by replaying those events. The ledger file is generated by Maat, but it is meant to be committed to version control when you want findings, accepted exceptions, and axiom history to travel with the repository. Maat does not require ledger backends to store actor identity; decision ownership can come from the repository history around the committed ledger changes.

The `LedgerBackend` interface is a contract, not a complete runtime enforcement boundary. Third-party ledger backends must preserve event-log semantics: events already accepted by `append()` should not be modified or removed, and `getState()` should represent the state derived from persisted events.

```ts
import {
  defineLedgerBackend,
  type LedgerEvent,
  type LedgerEventInput,
  type LedgerSnapshot,
} from '@maat-tools/contracts'
import { LedgerBackendBase } from '@maat-tools/core'

export type MemoryLedgerOptions = {
  name: string
}

const EMPTY_SNAPSHOT: LedgerSnapshot = {
  last_entry_id: null,
  findings: {},
  axioms: {},
}

export class MemoryLedgerBackend extends LedgerBackendBase {
  private readonly events: LedgerEvent[] = []
  private snapshot = EMPTY_SNAPSHOT

  async append(event: LedgerEventInput): Promise<void> {
    // stampEvent adds the standard ledger entry id before persistence.
    const stamped = this.stampEvent(event)
    this.events.push(stamped)

    // applyEvent folds the event into the current snapshot using Maat's state rules.
    this.snapshot = this.applyEvent(this.snapshot, stamped)
  }

  async getState(): Promise<LedgerSnapshot> {
    return this.snapshot
  }
}

// Register the ledger backend package id and options type for defineConfig() autocomplete.
declare module '@maat-tools/contracts' {
  interface LedgerBackendRegistry {
    '@acme/maat-ledger-memory': MemoryLedgerOptions
  }
}

export default defineLedgerBackend((options: MemoryLedgerOptions) => new MemoryLedgerBackend(options))
```

Extend `LedgerBackendBase` from `@maat-tools/core` when you want the standard event stamping, finding event creation, and fold behavior.

## Installing plugins

Install plugin packages with the package manager used by your project:

```bash
npm install -D @acme/maat-collector-python-imports @acme/maat-rule-python-boundaries @acme/maat-insight-repeated-boundary-pattern @maat-tools/file-ledger
```

```bash
bun add -d @acme/maat-collector-python-imports @acme/maat-rule-python-boundaries @acme/maat-insight-repeated-boundary-pattern @maat-tools/file-ledger
```

```bash
pnpm add -D @acme/maat-collector-python-imports @acme/maat-rule-python-boundaries @acme/maat-insight-repeated-boundary-pattern @maat-tools/file-ledger
```

```bash
yarn add -D @acme/maat-collector-python-imports @acme/maat-rule-python-boundaries @acme/maat-insight-repeated-boundary-pattern @maat-tools/file-ledger
```

Pin plugin versions in CI if findings or ledger decisions depend on them.

## Using plugins

Import the package in your config, then reference the package id:

```ts
import { defineConfig } from '@maat-tools/core'

// Import plugin packages once so their declaration merging is visible to TypeScript.
import '@acme/maat-collector-python-imports'
import '@acme/maat-rule-python-boundaries'
import '@acme/maat-insight-repeated-boundary-pattern'
import '@maat-tools/file-ledger'

export default defineConfig({
  check: { strict: true },
  collectors: [
    ['@acme/maat-collector-python-imports', { root: './services' }],
  ],
  rules: [
    [
      '@acme/maat-rule-python-boundaries',
      {
        forbiddenImports: [
          {
            sourceLayer: 'billing.domain',
            forbiddenLayer: 'payments.infrastructure',
          },
        ],
      },
    ],
  ],
  ledger: ['@maat-tools/file-ledger', { path: './maat-ledger.ndjson' }],
  insights: [
    ['@acme/maat-insight-repeated-boundary-pattern', { threshold: 3 }],
  ],
})
```

The import activates TypeScript declaration merging, so `defineConfig()` can validate the plugin options.

## `rule()` helper

The `rule()` helper from `@maat-tools/core` gives scoped autocomplete and enforces required config at the type level:

```ts
import { defineConfig, rule } from '@maat-tools/core'

export default defineConfig({
  rules: [
    rule('@acme/maat-rule-python-boundaries', {
      forbiddenImports: [
        { sourceLayer: 'billing.domain', forbiddenLayer: 'payments.infrastructure' },
      ],
    }),
  ],
})
```

The difference from the raw tuple syntax:

- **Scoped autocomplete** — IntelliSense inside `{ }` shows only the options for that specific rule, not the union of all registered rules.
- **Required config enforcement** — if a rule declares that config is required (no default can cover the project-specific threshold), TypeScript raises an error if you omit it. Rules with fully optional config can still be referenced as a bare string or with the tuple form.

When a rule's options type has at least one required field, `rule()` requires the second argument. When all fields are optional, the second argument is optional.

The raw tuple syntax `['@acme/maat-rule-python-boundaries', { ... }]` is still valid and type-checked, but the second element's type is resolved as a union across all registered rules, which reduces IntelliSense precision. Prefer `rule()` when configuring registered rules.
