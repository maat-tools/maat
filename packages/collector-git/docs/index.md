# `@maat-tools/collector-git`

::: info Provides
`git_commits` · `git_file_changes`
:::

Collects git history facts — commits and file changes — for use by git-based rules and insights.

## Facts Provided

| Fact | Type | Description |
|---|---|---|
| `git_commits` | `GitCommit[]` | One entry per commit: hash, author, email, ISO date, subject |
| `git_file_changes` | `GitFileChange[]` | One entry per file touched per commit: path, status, optional old path for renames |

### `GitCommit`

```ts
type GitCommit = {
	hash: string;
	author: string;
	authorEmail: string;
	date: string;        // ISO 8601
	subject: string;
};
```

### `GitFileChange`

```ts
type GitFileChange = {
	hash: string;
	path: string;
	status: GitHumanReadableFileStatus; // 'Added' | 'Modified' | 'Deleted' | 'Renamed' | 'Copied'
	oldPath?: string;      // present for Renamed and Copied
};
```

## Options

```ts
type GitInput = {
	repoPath?: string;
	sinceDays?: number;
	maxCommits?: number;
};
```

| Option | Default | Meaning |
|---|---|---|
| `repoPath` | `process.cwd()` | Path to the git repository root |
| `sinceDays` | — | Collect only commits from the last N days. Converted to an ISO date before being passed to git |
| `maxCommits` | — | Limits history depth via `git --max-count=` |

## Usage

```ts
export default defineConfig({
	collectors: [
		['@maat-tools/collector-git', { sinceDays: 90 }],
	],
});
```

With a commit cap:

```ts
export default defineConfig({
	collectors: [
		['@maat-tools/collector-git', {
			sinceDays: 90,
			maxCommits: 1000,
		}],
	],
});
```

## Notes

- The collector runs `git log` directly (via `execFile`, without a shell) in the configured `repoPath`. Git must be available in `PATH`.
- Renamed files carry `oldPath` so rules can follow file identity across renames.
- The collector returns all history matching the filter. Rules are responsible for applying their own time-window logic on top of the collected facts.
