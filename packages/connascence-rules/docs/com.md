# `com`

`com` detects Connascence of Meaning: the same literal value appearing across multiple files often means separate pieces of code depend on the same hidden concept.

## What It Checks

The rule groups collected constants by value, then reports a finding when the same value appears in enough distinct files.

Ignored values:

- Empty and whitespace-only values.
- Common low-signal values: `true`, `false`, `null`, `undefined`, `0`, `1`, `2`, `-1`.
- Import specifiers, because imports are structural references rather than magic values.
- Any value listed in `ignoreValues`.

## Options

```ts
type CoMRuleOptions = {
	threshold?: number;
	ignoreValues?: string[];
};
```

| Option | Default | Meaning |
|---|---:|---|
| `threshold` | `3` | Minimum number of distinct files required before a value becomes a finding |
| `ignoreValues` | `[]` | Extra literal values to ignore |

## Example

```ts
import com from '@maat-tools/connascence-rules/com';

export default defineConfig({
	rules: [
		com({
			threshold: 3,
			ignoreValues: ['draft'],
		}),
	],
});
```

If `"customer_status"` appears in three files, the rule reports:

```txt
"customer_status" appears in 3 files - possible Connascence of Meaning
```

## Finding Identity

Findings are identified by literal value:

```ts
ruleIdentifier: { value }
```

This keeps the same finding stable when additional occurrences are added or removed, as long as the shared value remains.
