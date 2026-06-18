# GPT 5.4

`model: 'gpt-5-4'`

Available through `openai` and `openrouter`.

## Configuration

```ts
// OpenAI
{
  provider: 'openai',
  model: 'gpt-5-4',
  extra: { apiKey: process.env.OPENAI_API_KEY },
}

// OpenRouter
{
  provider: 'openrouter',
  model: 'gpt-5-4',
  extra: { apiKey: process.env.OPENROUTER_API_KEY },
}
```

See [OpenAI](/guide/llm-models/openai) or [OpenRouter](/guide/llm-models/openrouter) for authentication.

## Specifications

| | |
|---|---|
| Max input tokens | 1,000,000 |
| Max output tokens | 128,000 |
| Temperature | Not sent — sampling parameters are unsupported on this model |

## Cost

| | Cost |
|---|---|
| Input tokens | $2.50 / million |
| Output tokens | $15.00 / million |

Costs are estimates. Actual billing depends on the provider and region.

## JSON output

JSON enrichers use `response_format: json_schema` (`strict: true`). See [JSON output and schemas](/guide/llm-models#json-output-and-schemas).

## Timeout

`timeoutMs` applies per individual LLM call within a batch. If unset, no explicit timeout is applied beyond the provider's default.

## Related

- [OpenAI](/guide/llm-models/openai)
- [LLM models overview](/guide/llm-models)
