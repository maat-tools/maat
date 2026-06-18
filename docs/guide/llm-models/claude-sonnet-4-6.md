# Claude Sonnet 4.6

`model: 'claude-sonnet-4-6'`

Available through `anthropic`, `vertex`, and `openrouter`.

## Configuration

```ts
// Anthropic
{
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  extra: { apiKey: process.env.ANTHROPIC_API_KEY },
}

// Vertex AI
{
  provider: 'vertex',
  model: 'claude-sonnet-4-6',
  extra: { project: 'my-gcp-project', location: 'us-central1' },
}
```

See [Anthropic](/guide/llm-models/anthropic), [Google Vertex AI](/guide/llm-models/vertex), or [OpenRouter](/guide/llm-models/openrouter) for authentication.

## Specifications

| | |
|---|---|
| Max input tokens | 1,000,000 |
| Max output tokens | 64,000 |
| Temperature | Not sent — sampling parameters are unsupported on this model |

## Cost

| | Cost |
|---|---|
| Input tokens | $3.00 / million |
| Output tokens | $15.00 / million |

Costs are estimates. Actual billing depends on the provider and region.

## JSON output

JSON enrichers use schema-enforced [structured outputs](/guide/llm-models#json-output-and-schemas) — `output_config.format` on the native Anthropic and Vertex paths, `response_format: json_schema` via OpenRouter.

## Timeout

`timeoutMs` applies per individual LLM call within a batch. If unset, no explicit timeout is applied beyond the provider's default.

## Related

- [Anthropic](/guide/llm-models/anthropic)
- [LLM models overview](/guide/llm-models)
