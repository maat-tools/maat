# Google Vertex AI

`provider: 'vertex'`

Vertex AI serves Gemini, Claude, and Grok models behind a single GCP project. Authentication uses [Application Default Credentials (ADC)](https://cloud.google.com/docs/authentication/application-default-credentials).

## Authentication

**Local development:**

```bash
gcloud auth application-default login
```

**CI / service account:**

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

## Required configuration

```ts
{
  provider: 'vertex',
  model: 'gemini-3-5-flash',
  extra: {
    project: 'my-gcp-project',   // GCP project ID
    location: 'us-central1',     // Vertex AI region
  },
}
```

Both `extra.project` and `extra.location` are required. The model will throw at startup if either is missing.

| Field | Description |
|---|---|
| `extra.project` | Your GCP project ID (e.g. `my-project-123`) |
| `extra.location` | The Vertex AI region (e.g. `us-central1`) |

## Available regions

Common choices: `us-central1`, `us-east4`, `europe-west1`. Refer to the [Vertex AI locations documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations) for the full list and model availability per region.

## Models

| Model | `model` |
|---|---|
| [Gemini 3.5 Flash](/guide/llm-models/gemini-3-5-flash) | `gemini-3-5-flash` |
| [Gemini 3.1 Pro Preview](/guide/llm-models/gemini-3-1-pro-preview) | `gemini-3-1-pro-preview` |
| [Claude Sonnet 4.6](/guide/llm-models/claude-sonnet-4-6) | `claude-sonnet-4-6` |
| [Claude Opus 4.8](/guide/llm-models/claude-opus-4-8) | `claude-opus-4-8` |
| [Claude Haiku 4.5](/guide/llm-models/claude-haiku-4-5) | `claude-haiku-4-5` |
| [Grok 4.3](/guide/llm-models/grok-4-3) | `grok-4-3` |

Claude models on Vertex are served through the AnthropicVertex backend; Gemini through the Google GenAI Vertex backend; Grok through Vertex's OpenAI-compatible endpoint. All three only need `extra.project` and `extra.location`.

## Related

- [LLM models overview](/guide/llm-models)
