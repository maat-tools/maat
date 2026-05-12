import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { type Collector, defineCollector, type FactRegistry } from '@maat-tools/contracts';

export const GIT_COMMITS_CAPABILITY = 'git_commits' as const;
export const GIT_FILE_CHANGES_CAPABILITY = 'git_file_changes' as const;

export type GitCommit = {
	hash: string;
	author: string;
	authorEmail: string;
	date: string;
	subject: string;
};

export const GitFileStatus = {
	Added: 'A',
	Modified: 'M',
	Deleted: 'D',
	Renamed: 'R',
	Copied: 'C',
} as const;

export type GitFileStatus = (typeof GitFileStatus)[keyof typeof GitFileStatus];

export type GitFileChange = {
	hash: string;
	path: string;
	status: GitFileStatus;
	oldPath?: string;
};

declare module '@maat-tools/contracts' {
	interface FactRegistry {
		git_commits: GitCommit[];
		git_file_changes: GitFileChange[];
	}
}

const execFileAsync = promisify(execFile);

const FORMAT = 'COMMIT\x01%H\x01%aN\x01%aE\x01%aI\x01%s';
const VALID_STATUSES = new Set<string>(Object.values(GitFileStatus));

export type GitInput = {
	repoPath?: string;
	sinceDays?: number;
	maxCommits?: number;
};

export function parseGitLog(output: string): { commits: GitCommit[]; fileChanges: GitFileChange[] } {
	const commits: GitCommit[] = [];
	const fileChanges: GitFileChange[] = [];
	let currentHash: string | null = null;

	for (const line of output.split('\n')) {
		if (line.startsWith('COMMIT\x01')) {
			const parts = line.split('\x01');
			const hash = parts[1];
			const author = parts[2];
			const authorEmail = parts[3];
			const date = parts[4];
			const subject = parts.slice(5).join('\x01');

			if (!hash || !author || !authorEmail || !date) {
				continue;
			}

			currentHash = hash;
			commits.push({ hash, author, authorEmail, date, subject });
			continue;
		}

		if (!currentHash || !line.trim()) {
			continue;
		}

		const parts = line.split('\t');
		const rawStatus = parts[0];
		if (!rawStatus) {
			continue;
		}

		const statusCode = rawStatus[0];
		if (!statusCode || !VALID_STATUSES.has(statusCode)) {
			continue;
		}

		const status = statusCode as GitFileStatus;

		if (status === GitFileStatus.Renamed || status === GitFileStatus.Copied) {
			const oldPath = parts[1];
			const newPath = parts[2];
			if (!oldPath || !newPath) {
				continue;
			}
			fileChanges.push({ hash: currentHash, path: newPath, status, oldPath });
		} else {
			const path = parts[1];
			if (!path) {
				continue;
			}
			fileChanges.push({ hash: currentHash, path, status });
		}
	}

	return { commits, fileChanges };
}

export class GitCollector implements Collector<'git_commits' | 'git_file_changes'> {
	public readonly id = 'git';
	public readonly provideFacts = [GIT_COMMITS_CAPABILITY, GIT_FILE_CHANGES_CAPABILITY] as const;

	public constructor(private readonly config: GitInput) { }

	public async collect(): Promise<Pick<FactRegistry, 'git_commits' | 'git_file_changes'>> {
		const cwd = this.config.repoPath ?? process.cwd();
		const args = ['-c', 'core.quotepath=false', 'log', `--format=${FORMAT}`, '--name-status'];

		if (this.config.sinceDays !== undefined) {
			const since = new Date(Date.now() - this.config.sinceDays * 24 * 60 * 60 * 1000);
			args.push(`--since=${since.toISOString()}`);
		}
		if (this.config.maxCommits !== undefined) {
			args.push(`--max-count=${this.config.maxCommits}`);
		}
		const { stdout } = await execFileAsync('git', args, {
			cwd,
			maxBuffer: 100 * 1024 * 1024,
		});

		const { commits, fileChanges } = parseGitLog(stdout);

		return {
			git_commits: commits,
			git_file_changes: fileChanges,
		};
	}
}

declare module '@maat-tools/contracts' {
	interface CollectorRegistry {
		'@maat-tools/collector-git': GitInput;
	}
}

export default defineCollector((config: GitInput) => new GitCollector(config));
