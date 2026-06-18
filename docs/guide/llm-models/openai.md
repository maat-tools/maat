# OpenAI

`provider: 'openai'`

The OpenAI provider reaches GPT models through OpenAI's API. The same models can be reached through [OpenRouter](/guide/llm-models/openrouter).

## Authentication

Get an API key from the [OpenAI platform](https://platform.openai.com/api-keys) and pass it through `extra.apiKey`:

```ts
{
  provider: 'openai',
  model: 'gpt-5-5',
  extra: { apiKey: process.env.OPENAI_API_KEY },
}
```

## Configuration

| Field | Required | Description |
|---|---|---|
| `extra.apiKey` | Recommended | OpenAI API key. If omitted, the OpenAI client falls back to `OPENAI_API_KEY`. |
| `extra.baseUrl` | Optional | Override the API base URL — useful for Azure OpenAI or a compatible proxy. |

## Models

| Model | `model` |
|---|---|
| [GPT 5.4](/guide/llm-models/gpt-5-4) | `gpt-5-4` |
| [GPT 5.5](/guide/llm-models/gpt-5-5) | `gpt-5-5` |

## JSON output

GPT models use `response_format: json_schema` (`strict: true`) for schema-enforced JSON. See [JSON output and schemas](/guide/llm-models#json-output-and-schemas). `temperature` is not sent.

## Related

- [LLM models overview](/guide/llm-models)
- [OpenRouter](/guide/llm-models/openrouter)
