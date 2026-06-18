# xAI

`provider: 'xai'`

The xAI provider reaches Grok models through xAI's first-party OpenAI-compatible API (`https://api.x.ai/v1`). Grok is also available through [Vertex AI](/guide/llm-models/vertex) and [OpenRouter](/guide/llm-models/openrouter).

## Authentication

Get an API key from the [xAI Console](https://console.x.ai/) and pass it through `extra.apiKey`:

```ts
{
  provider: 'xai',
  model: 'grok-4-3',
  extra: { apiKey: process.env.XAI_API_KEY },
}
```

## Configuration

| Field | Required | Description |
|---|---|---|
| `extra.apiKey` | Recommended | xAI API key. The base URL is fixed to `https://api.x.ai/v1`. |

## Models

| Model | `model` |
|---|---|
| [Grok 4.3](/guide/llm-models/grok-4-3) | `grok-4-3` |

## JSON output

Grok uses the OpenAI-compatible `response_format: json_schema` (`strict: true`) for schema-enforced JSON. See [JSON output and schemas](/guide/llm-models#json-output-and-schemas). `temperature` is not sent.

## Related

- [LLM models overview](/guide/llm-models)
- [OpenRouter](/guide/llm-models/openrouter)
