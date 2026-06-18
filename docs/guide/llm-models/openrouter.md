# OpenRouter

`provider: 'openrouter'`

OpenRouter is an aggregator: it reaches **every** maat-supported model through a single API key and a single OpenAI-compatible endpoint. Use it to try models from different vendors without provisioning each first-party account.

## Authentication

Get an API key from [OpenRouter](https://openrouter.ai/keys) and pass it through `extra.apiKey`:

```ts
{
  provider: 'openrouter',
  model: 'claude-opus-4-8',
  extra: { apiKey: process.env.OPENROUTER_API_KEY },
}
```

maat sends the `HTTP-Referer` and `X-Title` headers OpenRouter uses for attribution automatically.

## Configuration

| Field | Required | Description |
|---|---|---|
| `extra.apiKey` | Recommended | OpenRouter API key. |
| `extra.baseUrl` | Optional | Override the endpoint. Defaults to `https://openrouter.ai/api/v1`. |

## Models

Every supported model is available. maat maps the model id to the OpenRouter slug automatically:

| `model` | OpenRouter slug |
|---|---|
| `gemini-3-5-flash` | `google/gemini-3.5-flash` |
| `gemini-3-1-pro-preview` | `google/gemini-3.1-pro-preview` |
| `claude-sonnet-4-6` | `anthropic/claude-sonnet-4.6` |
| `claude-opus-4-8` | `anthropic/claude-opus-4.8` |
| `claude-haiku-4-5` | `anthropic/claude-haiku-4.5` |
| `grok-4-3` | `x-ai/grok-4.3` |
| `gpt-5-4` | `openai/gpt-5.4` |
| `gpt-5-5` | `openai/gpt-5.5` |

## JSON output

OpenRouter routes JSON enrichers through `response_format: json_schema` (`strict: true`). Schema enforcement ultimately depends on the upstream model's support. See [JSON output and schemas](/guide/llm-models#json-output-and-schemas). `temperature` is sent only for Gemini models.

## Related

- [LLM models overview](/guide/llm-models)
