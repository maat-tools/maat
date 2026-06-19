# CI integration

## Cache

maat writes all intermediate facts to `.maat/cache/`. Collectors write AST facts there; enrichers write LLM results there. The cache is content-addressed: each entry is keyed by the hash of the content that produced it, so entries for unchanged files are always reused and stale entries are pruned automatically after each run.

Commit `.maat/cache/` with your repository. This gives CI read access to everything that was already computed locally — same facts, no redundant work, no external calls for unchanged code.

### One-way flow and cache misses

The committed cache creates a one-way flow: local runs populate it, CI reads from it. CI cannot write back to the repository.

When a developer pushes code without running `maat check` locally first, CI encounters a cache miss for the new files. What happens depends on which layer missed:

| Layer | On cache miss | Cost |
|---|---|---|
| **Collector** | Recomputes AST facts for the changed files | Cheap — no external calls |
| **Enricher** | Calls the LLM for the changed items | Requires API key in CI env; billed per call |

For enrichers, CI needs a provider API key available as an environment variable (e.g. `VERTEX_AI_TOKEN`, `ANTHROPIC_API_KEY`). The result is used for that run but cannot be committed back, so the next CI run for the same unchanged files will call the LLM again.

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

This keeps LLM costs bounded to genuinely changed files within a pull request, regardless of how many times CI runs on that branch. The collector cache is also preserved, so AST facts are not recomputed on every push.

### Known limitation

CI-generated cache entries are not available to local developer runs — the flow does not reverse. A developer who pulls the branch after CI ran will still get a local cache miss for files that CI already analyzed.

A remote content-addressed cache (similar to Turborepo Remote Cache or Nx Cloud) would allow fully bidirectional sharing between CI and local without requiring repository write access. This is on the roadmap; the committed local cache is the default until then.
