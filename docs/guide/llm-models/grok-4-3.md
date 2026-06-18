# Grok 4.3

`model: 'grok-4-3'`

Available through `xai`, `vertex`, and `openrouter`.

## Configuration

```ts
// xAI
{
  provider: 'xai',
  model: 'grok-4-3',
  extra: { apiKey: process.env.XAI_API_KEY },
}

// Vertex AI
{
  provider: 'vertex',
  model: 'grok-4-3',
  extra: { project: 'my-gcp-project', location: 'us-central1' },
}
```

See [xAI](/guide/llm-models/xai), [Google Vertex AI](/guide/llm-models/vertex), or [OpenRouter](/guide/llm-models/openrouter) for authentication.

## Specifications

| | |
|---|---|
| Max input tokens | 1,000,000 |
| Max output tokens | 131,000 |
| Temperature | Not sent — sampling parameters are unsupported on this model |

## Cost

| | Cost |
|---|---|
| Input tokens | $1.25 / million |
| Output tokens | $2.50 / million |

Costs are estimates. Actual billing depends on the provider and region.

## JSON output

JSON enrichers use the OpenAI-compatible `response_format: json_schema` (`strict: true`). See [JSON output and schemas](/guide/llm-models#json-output-and-schemas).

## Timeout

`timeoutMs` applies per individual LLM call within a batch. If unset, no explicit timeout is applied beyond the provider's default.

## Related

- [xAI](/guide/llm-models/xai)
- [LLM models overview](/guide/llm-models)
