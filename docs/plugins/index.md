# Plugins

Maat plugins package collectors, rules, insights, and ledger backends behind stable public interfaces.

## Official Plugins

| Plugin | Purpose |
|---|---|
| [`@maat-tools/coupling-rules`](./coupling-rules/) | Enforce import boundaries between packages and architectural layers |
| [`@maat-tools/connascence-rules`](./connascence-rules/) | Detect connascence signals in source code |
| [`@maat-tools/collector-ts`](./collector-ts/) | Collect TypeScript source facts (constants and imports) |
| [`@maat-tools/collector-git`](./collector-git/) | Collect git history facts (commits and file changes) |
| [`@maat-tools/git-rules`](./git-rules/) | Rules derived from git history |
| [`@maat-tools/insights`](./insights/) | Cross-cutting insights over findings from multiple rule families |

Use the plugin-specific pages for rule options, examples, and finding behavior.
