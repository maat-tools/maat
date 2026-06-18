# LLM models

LLM-backed enrichers share a common configuration type that specifies the provider and model. maat abstracts over providers so enrichers stay portable — the same model can often be reached through more than one provider (its own first-party API, Vertex AI, or OpenRouter) without changing anything else in your config.

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
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      extra: { apiKey: process.env.ANTHROPIC_API_KEY },
    }],
  ],
  rules: [['@maat-tools/connascence-rules/com-semantic', { threshold: '0.8' }]],
})
```

The `provider` selects how the model is reached and which credentials it needs; the `model` is the stable maat model id. maat resolves the right provider-specific model string internally (for example `claude-opus-4-8` becomes `anthropic/claude-opus-4.8` on OpenRouter).

## Supported providers

| Provider | `provider` | Auth | Models |
|---|---|---|---|
| [Google Vertex AI](/guide/llm-models/vertex) | `vertex` | ADC (`project` + `location`) | Gemini, Claude, Grok |
| [Google AI](/guide/llm-models/google) | `google` | API key | Gemini |
| [Anthropic](/guide/llm-models/anthropic) | `anthropic` | API key | Claude |
| [xAI](/guide/llm-models/xai) | `xai` | API key | Grok |
| [OpenAI](/guide/llm-models/openai) | `openai` | API key | GPT |
| [OpenRouter](/guide/llm-models/openrouter) | `openrouter` | API key | All of the above |

## Supported models

| Model | `model` | Providers | Max output | Cost (in / out per Mtok) |
|---|---|---|---|---|
| [Gemini 3.5 Flash](/guide/llm-models/gemini-3-5-flash) | `gemini-3-5-flash` | `vertex`, `google`, `openrouter` | 65,536 | $1.50 / $9.00 |
| [Gemini 3.1 Pro Preview](/guide/llm-models/gemini-3-1-pro-preview) | `gemini-3-1-pro-preview` | `vertex`, `google`, `openrouter` | 64,000 | $2.00 / $12.00 |
| [Claude Sonnet 4.6](/guide/llm-models/claude-sonnet-4-6) | `claude-sonnet-4-6` | `anthropic`, `vertex`, `openrouter` | 64,000 | $3.00 / $15.00 |
| [Claude Opus 4.8](/guide/llm-models/claude-opus-4-8) | `claude-opus-4-8` | `anthropic`, `vertex`, `openrouter` | 128,000 | $5.00 / $25.00 |
| [Claude Haiku 4.5](/guide/llm-models/claude-haiku-4-5) | `claude-haiku-4-5` | `anthropic`, `vertex`, `openrouter` | 64,000 | $1.00 / $5.00 |
| [Grok 4.3](/guide/llm-models/grok-4-3) | `grok-4-3` | `xai`, `vertex`, `openrouter` | 131,000 | $1.25 / $2.50 |
| [GPT 5.4](/guide/llm-models/gpt-5-4) | `gpt-5-4` | `openai`, `openrouter` | 128,000 | $2.50 / $15.00 |
| [GPT 5.5](/guide/llm-models/gpt-5-5) | `gpt-5-5` | `openai`, `openrouter` | 128,000 | $5.00 / $30.00 |

All models expose a 1,000,000-token input window except Claude Haiku 4.5, which is 200,000.

## JSON output and schemas

Enrichers that need structured data ask the model for JSON. maat enforces this with the strongest mechanism each provider supports, and always returns the same shape to the enricher:

| Provider / path | Enforcement |
|---|---|
| Gemini (native) | Native `responseSchema` |
| Claude (native) | `output_config.format` JSON-schema structured outputs |
| OpenAI · Grok · OpenRouter · Claude-via-OpenRouter | `response_format: json_schema` with `strict: true` |

When a response schema is provided, maat wraps it into a strict, object-rooted schema for the provider (array roots are rejected by structured-output APIs) and unwraps the result before handing it back — so enrichers always receive a plain array. **Strict structured outputs make every field in the schema required.** For extraction-style enrichers this is the desired behavior; if a schema has genuinely optional fields, express them as nullable types.

If no schema is supplied, JSON mode falls back to a plain "valid JSON object" request plus a system-prompt instruction.

## Determinism

maat asks for the most reproducible output each provider allows. Gemini requests are sent with `temperature: 0`. The Claude and GPT/Grok model families no longer accept sampling parameters (`temperature`, `top_p`, `top_k`) on these model versions — sending them is a hard error — so maat omits them and relies on the providers' deterministic defaults. See [Repeatable results](/guide/determinism).

## Cache and cost

Every LLM response is cached at `.maat/enricher-cache/` by default, keyed by content hash, provider, model, and prompt instructions. Only items whose code actually changed trigger new calls. Commit `.maat/enricher-cache/` to share the cache across CI environments.

Set the `MAAT_ENRICHER_CACHE_DIR` environment variable to override the cache location.

To bypass the cache for a single run, use [`maat check --no-cache`](/commands/check).

## Related

- [Enrichers guide](/guide/enrichers)
- [`@maat-tools/enricher-llm`](/plugins/enricher-llm/)
