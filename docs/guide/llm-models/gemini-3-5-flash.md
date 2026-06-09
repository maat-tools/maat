# Gemini 3.5 Flash

`provider: 'vertex'` · `model: 'gemini-3-5-flash'`

## Configuration

```ts
{
  provider: 'vertex',
  model: 'gemini-3-5-flash',
  extra: {
    project: 'my-gcp-project',
    location: 'us-central1',
  },
  timeoutMs: 30_000,  // optional
}
```

See [Google Vertex AI](/guide/llm-models/vertex) for authentication and region setup.

## Specifications

| | |
|---|---|
| Max input tokens | 1,000,000 |
| Max output tokens | 65,536 |
| Temperature | `0` (fixed — not configurable) |

## Cost

| | Cost |
|---|---|
| Input tokens | $1.50 / million |
| Output tokens | $9.00 / million |

Costs are estimates based on Vertex AI pricing. Actual billing depends on your GCP contract and region.

## Timeout

`timeoutMs` applies per individual LLM call within a batch. If unset, no explicit timeout is applied beyond the provider's default.

## Related

- [Google Vertex AI](/guide/llm-models/vertex)
- [LLM models overview](/guide/llm-models)
