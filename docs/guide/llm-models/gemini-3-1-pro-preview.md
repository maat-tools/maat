# Gemini 3.1 Pro Preview

`model: 'gemini-3-1-pro-preview'`

Available through `vertex`, `google`, and `openrouter`.

## Configuration

```ts
// Vertex AI
{
  provider: 'vertex',
  model: 'gemini-3-1-pro-preview',
  extra: { project: 'my-gcp-project', location: 'us-central1' },
}

// Google AI
{
  provider: 'google',
  model: 'gemini-3-1-pro-preview',
  extra: { apiKey: process.env.GEMINI_API_KEY },
}
```

See [Google Vertex AI](/guide/llm-models/vertex) or [Google AI](/guide/llm-models/google) for authentication.

## Specifications

| | |
|---|---|
| Max input tokens | 1,000,000 |
| Max output tokens | 64,000 |
| Temperature | `0` (fixed — not configurable) |

## Cost

| | Cost |
|---|---|
| Input tokens | $2.00 / million |
| Output tokens | $12.00 / million |

Costs are estimates. Actual billing depends on the provider and region.

## Timeout

`timeoutMs` applies per individual LLM call within a batch. If unset, no explicit timeout is applied beyond the provider's default.

## Related

- [Google Vertex AI](/guide/llm-models/vertex)
- [Google AI](/guide/llm-models/google)
- [LLM models overview](/guide/llm-models)
