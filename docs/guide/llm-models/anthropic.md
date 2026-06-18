# Anthropic

`provider: 'anthropic'`

The Anthropic provider reaches Claude models through Anthropic's first-party API. To run Claude through your GCP project instead, use [Vertex AI](/guide/llm-models/vertex); to reach it through an aggregator, use [OpenRouter](/guide/llm-models/openrouter).

## Authentication

Get an API key from the [Anthropic Console](https://console.anthropic.com/) and pass it through `extra.apiKey`:

```ts
{
  provider: 'anthropic',
  model: 'claude-haiku-4-5',
  extra: { apiKey: process.env.ANTHROPIC_API_KEY },
}
```

## Configuration

| Field | Required | Description |
|---|---|---|
| `extra.apiKey` | Recommended | Anthropic API key. If omitted, the Anthropic client falls back to `ANTHROPIC_API_KEY`. |

## Models

| Model | `model` |
|---|---|
| [Claude Sonnet 4.6](/guide/llm-models/claude-sonnet-4-6) | `claude-sonnet-4-6` |
| [Claude Opus 4.8](/guide/llm-models/claude-opus-4-8) | `claude-opus-4-8` |
| [Claude Haiku 4.5](/guide/llm-models/claude-haiku-4-5) | `claude-haiku-4-5` |

## JSON output

On the native Anthropic path, JSON enrichers use [structured outputs](/guide/llm-models#json-output-and-schemas) (`output_config.format`) for schema-enforced responses. These Claude versions do not accept `temperature` — maat omits it and relies on the model's deterministic defaults.

## Related

- [LLM models overview](/guide/llm-models)
- [Google Vertex AI](/guide/llm-models/vertex)
- [OpenRouter](/guide/llm-models/openrouter)
