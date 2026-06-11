# Plugins

maat plugins package collectors, rules, insights, and ledger backends behind stable public interfaces.

## Official Plugins

| Plugin | Purpose |
|---|---|
| [`@maat-tools/coupling-rules`](./coupling-rules/) | Enforce import boundaries between packages and architectural layers |
| [`@maat-tools/connascence-rules`](./connascence-rules/) | Detect connascence signals in source code |
| [`@maat-tools/collector-ts`](./collector-ts/) | Collect TypeScript source facts (constants, imports, function signatures, positional data, algorithmic bindings, call graph) |
| [`@maat-tools/collector-git`](./collector-git/) | Collect git history facts (commits and file changes) |
| [`@maat-tools/git-rules`](./git-rules/) | Rules derived from git history |
| [`@maat-tools/insights`](./insights/) | Cross-cutting insights over findings from multiple rule families |
| [`@maat-tools/enricher-llm`](./enricher-llm/) | LLM-backed enrichers for semantic interpretation (probabilistic) |
| [`@maat-tools/presets-ts`](./presets-ts/) | Ready-made `AlgorithmicPattern` presets for `@maat-tools/collector-ts` |
| [`@maat-tools/file-ledger`](./file-ledger/) | Append-only NDJSON file backend for the maat ledger |

Use the plugin-specific pages for rule options, examples, and finding behavior.
