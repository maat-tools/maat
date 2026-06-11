# Connascence of Meaning (COM) enricher

::: info
**Id:** `maat-tools/enricher-llm/com@v1` · **Needs:** `functionSignatures` · **Provides:** `comCandidates`
:::

The COM enricher analyzes function signatures collected by [`@maat-tools/collector-ts`](/plugins/collector-ts/) and asks the LLM which functions exhibit semantic Connascence of Meaning — the same return value encoding multiple distinct outcomes (e.g. `null` meaning both "not found" and "error").

It pre-filters deterministically before any LLM call: only functions whose output is heterogeneous **and** whose return sites repeat the same value are sent for assessment. Candidates are sent in batched LLM calls, and each response is [cached per item](/plugins/enricher-llm/#caching-always-on), so unchanged functions never trigger new calls.

For each function the LLM judges as CoM, the enricher emits a `comCandidates` fact:

```ts
type CoMCandidate = {
  signature: FunctionSignature
  confidence: number // 0.0–1.0
  reason: string
}
```

These facts feed the [`com-semantic`](/plugins/connascence-rules/com-semantic) rule, which applies a confidence threshold and produces the actual findings.

## Configuration

```ts
export default defineConfig({
  collectors: [
    ['@maat-tools/collector-ts', { tsConfigFilePath: './tsconfig.json' }],
  ],
  enrichers: [
    ['@maat-tools/enricher-llm/com', {
      provider: 'vertex',
      model: 'gemini-3-5-flash',
      extra: { project: 'my-gcp-project', location: 'us-central1' },
    }],
  ],
  rules: [
    ['@maat-tools/connascence-rules/com-semantic', { threshold: '0.8' }],
  ],
})
```

## Related

- [`@maat-tools/enricher-llm` overview](/plugins/enricher-llm/)
- [`com-semantic` rule](/plugins/connascence-rules/com-semantic)
- [Enrichers guide](/guide/enrichers)
