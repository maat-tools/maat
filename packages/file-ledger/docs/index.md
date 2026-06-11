# `@maat-tools/file-ledger`

Append-only file backend for the maat ledger. Events are stored as NDJSON (one JSON event per line) in a single file committed alongside the repository.

## What It Does

The ledger is maat's memory: every finding observation, baseline, resolution, verification, and axiom declaration is recorded as an event. This backend persists those events to a plain text file:

- **Append-only.** Events are only ever appended — existing lines are never rewritten. History stays intact.
- **State by replay.** The current state (findings, axioms) is derived by replaying every event from the top of the file. There is no separate state store and no migration on read.
- **One event per line.** Each line is a self-contained JSON object stamped with a unique `entry_id` and the `run_id` of the run that produced it.
- **No user identity.** Events carry fingerprints, rule IDs, messages, artifacts, and optional reasons — not who ran the command.

## Options

```ts
type FilePathLedgerOptions = {
	path: string;
};
```

| Option | Default | Meaning |
|---|---|---|
| `path` | — | Path to the ledger file, relative to the config file's directory. Must end with `.ndjson` — the backend throws otherwise |

## Usage

```ts
export default defineConfig({
	collectors: [ /* ... */ ],
	rules: [ /* ... */ ],
	ledger: ['@maat-tools/file-ledger', { path: './maat-ledger.ndjson' }],
});
```

With a ledger configured, `maat check --ledger` appends events for new, resolved, and unverified findings, and commands such as `maat baseline`, `maat verify`, and `maat axiom` record their decisions.

## Notes

- **Commit the file.** The ledger file belongs in version control — it is the shared record of what the team has observed and decided. If the file does not exist yet, it is created on the first append.
- An empty or missing file replays to an empty state; the first run starts from scratch.
- Reads are served from an in-memory snapshot built once at initialization and kept in sync as events are appended during the run.
