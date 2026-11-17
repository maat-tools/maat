# CI integration

Run `maat check` in CI to check the configured rules against each change. A configured ledger is read automatically; `--ledger` writes events and belongs in intentional ledger maintenance, as described in the [adoption guide](./adoption.md).

Visible findings that do not require verification fail in strict mode. Regressions and expired baselines fail regardless of strict mode, including a returning resolved probabilistic finding that is still pending verification. New unverified findings do not fail the check on their own.

## Cache

The official TypeScript collector stores AST facts under `.maat/cache/collector-ts/`; the LLM enricher stores results under `.maat/cache/enrichers/`, beneath the resolved project root. Cache keys include the inputs used to produce each entry. Available entries with matching keys are reused; the collector and enricher prune entries they no longer use.

You can commit `.maat/cache/` to share previously computed results with CI. Matching entries avoid repeated work; missing entries or changed inputs can require new computation or LLM calls.

### One-way flow and cache misses

The committed cache creates a one-way flow: local runs populate it, CI reads from it. CI cannot write back to the repository.

When a developer pushes code without running `maat check` locally first, CI encounters a cache miss for the new files. What happens depends on which layer missed:

| Layer | On cache miss | Cost |
|---|---|---|
| **Collector** | Recomputes AST facts for the changed files | Cheap — no external calls |
| **Enricher** | Calls the LLM for the changed items | Requires API key in CI env; billed per call |

For LLM-backed enrichers, CI needs credentials for the configured provider. See [LLM models](./llm-models.md) for API-key and Vertex AI authentication options. The result is used for that run but cannot be committed back, so the next CI run for the same unchanged files will call the LLM again.

### Reducing repeated LLM calls in CI

Use your CI provider's built-in cache to persist `.maat/cache/` between runs on the same branch:

```yaml
# GitHub Actions example
- uses: actions/cache@v4
  with:
    path: .maat/cache
    key: maat-${{ runner.os }}-${{ hashFiles('**/*.ts') }}
    restore-keys: maat-${{ runner.os }}-
```

Restoring matching cache entries avoids repeated calls for those inputs. Cache eviction, a miss, changed inputs, or `--no-cache` can still cause LLM calls. The same cache also preserves collector results.

### Known limitation

CI-generated cache entries are not available to local developer runs — the flow does not reverse. A developer who pulls the branch after CI ran will still get a local cache miss for files that CI already analyzed.

A remote content-addressed cache (similar to Turborepo Remote Cache or Nx Cloud) would allow fully bidirectional sharing between CI and local without requiring repository write access. This is on the roadmap; the committed local cache is the default until then.
