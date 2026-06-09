# Google Vertex AI

`provider: 'vertex'`

Vertex AI is the only supported provider. Authentication uses [Application Default Credentials (ADC)](https://cloud.google.com/docs/authentication/application-default-credentials).

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

| Model | `model` | Page |
|---|---|---|
| Gemini 3.5 Flash | `gemini-3-5-flash` | [Details](/guide/llm-models/gemini-3-5-flash) |

## Related

- [LLM models overview](/guide/llm-models)
- [Gemini 3.5 Flash](/guide/llm-models/gemini-3-5-flash)
