# Claude Haiku 4.5

`model: 'claude-haiku-4-5'`

Available through `anthropic`, `vertex`, and `openrouter`. The fastest and most cost-effective Claude model maat supports — a good default for high-volume enrichers.

## Configuration

```ts
// Anthropic
{
  provider: 'anthropic',
  model: 'claude-haiku-4-5',
  extra: { apiKey: process.env.ANTHROPIC_API_KEY },
}

// Vertex AI
{
  provider: 'vertex',
  model: 'claude-haiku-4-5',
  extra: { project: 'my-gcp-project', location: 'us-central1' },
}
```

See [Anthropic](/guide/llm-models/anthropic), [Google Vertex AI](/guide/llm-models/vertex), or [OpenRouter](/guide/llm-models/openrouter) for authentication.

## Specifications

| | |
|---|---|
| Max input tokens | 200,000 |
| Max output tokens | 64,000 |
| Temperature | Not sent — sampling parameters are unsupported on this model |

Note the smaller 200,000-token input window — the rest of maat's models accept 1,000,000.

## Cost

| | Cost |
|---|---|
| Input tokens | $1.00 / million |
| Output tokens | $5.00 / million |

Costs are estimates. Actual billing depends on the provider and region.

## JSON output

JSON enrichers use schema-enforced [structured outputs](/guide/llm-models#json-output-and-schemas) — `output_config.format` on the native Anthropic and Vertex paths, `response_format: json_schema` via OpenRouter.

## Timeout

`timeoutMs` applies per individual LLM call within a batch. If unset, no explicit timeout is applied beyond the provider's default.

## Related

- [Anthropic](/guide/llm-models/anthropic)
- [LLM models overview](/guide/llm-models)
