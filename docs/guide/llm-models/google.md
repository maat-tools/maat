# Google AI

`provider: 'google'`

The Google AI (Gemini API) provider reaches Gemini models with a plain API key, without a GCP project. Use [Vertex AI](/guide/llm-models/vertex) instead when you need enterprise auth, regional control, or access to Claude/Grok through the same project.

## Authentication

Get an API key from [Google AI Studio](https://aistudio.google.com/apikey) and pass it through `extra.apiKey`:

```ts
{
  provider: 'google',
  model: 'gemini-3-5-flash',
  extra: { apiKey: process.env.GEMINI_API_KEY },
}
```

## Configuration

| Field | Required | Description |
|---|---|---|
| `extra.apiKey` | Recommended | Google AI API key. If omitted, the Google GenAI client falls back to its own environment-variable resolution. |

## Models

| Model | `model` |
|---|---|
| [Gemini 3.5 Flash](/guide/llm-models/gemini-3-5-flash) | `gemini-3-5-flash` |
| [Gemini 3.1 Pro Preview](/guide/llm-models/gemini-3-1-pro-preview) | `gemini-3-1-pro-preview` |

## Related

- [LLM models overview](/guide/llm-models)
- [Google Vertex AI](/guide/llm-models/vertex)
