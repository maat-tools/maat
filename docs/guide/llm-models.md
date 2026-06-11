# LLM models

LLM-backed enrichers share a common configuration type that specifies the provider and model. maat abstracts over providers so enrichers stay portable.

## Configuration shape

```ts
type LLMConfig = {
  provider: string
  model: string
  extra?: Record<string, unknown>
  timeoutMs?: number
}
```

This config is passed directly to the enricher in `maat.config.ts`:

```ts
import { defineConfig } from '@maat-tools/core'

export default defineConfig({
  collectors: [['@maat-tools/collector-ts', { tsConfigFilePath: './tsconfig.json' }]],
  enrichers: [
    ['@maat-tools/enricher-llm/com', {
      provider: 'vertex',
      model: 'gemini-3-5-flash',
      extra: { project: 'my-gcp-project', location: 'us-central1' },
    }],
  ],
  rules: [['@maat-tools/connascence-rules/com-semantic', { threshold: '0.8' }]],
})
```

## Supported providers

| Provider | `provider` | Models |
|---|---|---|
| [Google Vertex AI](/guide/llm-models/vertex) | `vertex` | [Gemini 3.5 Flash](/guide/llm-models/gemini-3-5-flash) |

## Cache and cost

Every LLM response is cached at `.maat/enricher-cache/`, keyed by content hash, model version, and prompt instructions. Only items whose code actually changed trigger new calls. Commit `.maat/enricher-cache/` to share the cache across CI environments.

Set the `MAAT_ENRICHER_CACHE_DIR` environment variable to override the cache location.

## Related

- [Enrichers guide](/guide/enrichers)
- [`@maat-tools/enricher-llm`](/plugins/enricher-llm/)
