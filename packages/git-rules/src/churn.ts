import {
	GIT_COMMITS_CAPABILITY,
	GIT_FILE_CHANGES_CAPABILITY,
	type GitCommit,
	type GitFileChange,
} from '@maat-tools/collector-git';
import { type Artifact, defineRule, type FindingRuleOutput, type Rule } from '@maat-tools/contracts';
import { isMatch } from '@maat-tools/utils';

declare module '@maat-tools/contracts' {
	interface RuleRegistry {
		'@maat-tools/git-rules/churn': ChurnOptions;
	}
}

export type ChurnOptions = {
	threshold?: number;
	windowDays?: number;
	exclude?: string[];
};

export class ChurnRule implements Rule<'git_commits' | 'git_file_changes'> {
	public readonly id = 'maat-tools/git-rules/churn@v1';
	public readonly instanceId = this.id;
	public readonly needFacts = [GIT_COMMITS_CAPABILITY, GIT_FILE_CHANGES_CAPABILITY] as const;

	private readonly threshold: number;
	private readonly windowMs: number;
	private readonly exclude: string[];

	public constructor(options: ChurnOptions = {}) {
		this.threshold = options.threshold ?? 10;
		this.windowMs = (options.windowDays ?? 90) * 24 * 60 * 60 * 1000;
		this.exclude = options.exclude ?? [];
	}

	public evaluate(facts: { git_commits: GitCommit[]; git_file_changes: GitFileChange[] }): FindingRuleOutput[] {
		const cutoff = Date.now() - this.windowMs;

		const hashesInWindow = new Set(
			facts.git_commits.filter((c) => new Date(c.date).getTime() >= cutoff).map((c) => c.hash),
		);

		const changeCount = new Map<string, number>();
		for (const change of facts.git_file_changes) {
			if (!hashesInWindow.has(change.hash)) {
				continue;
			}
			if (this.exclude.length > 0 && isMatch(change.path, this.exclude)) {
				continue;
			}
			changeCount.set(change.path, (changeCount.get(change.path) ?? 0) + 1);
		}

		const findings: FindingRuleOutput[] = [];
		for (const [path, count] of changeCount) {
			if (count < this.threshold) {
				continue;
			}
			findings.push({
				ruleId: this.id,
				ruleIdentifier: { path },
				message: `"${path}" changed ${count} times in the last ${Math.round(this.windowMs / (24 * 60 * 60 * 1000))} days — high churn`,
				artifacts: [{ kind: 'git-churn', data: { path, count } }],
			});
		}

		return findings;
	}

	public describeArtifact(artifact: Artifact): Record<string, string> {
		if (artifact.kind !== 'git-churn') {
			return { value: String(artifact.data) };
		}
		const data = artifact.data as { path: string; count: number };

		return { file: data.path, changes: String(data.count) };
	}
}

export default defineRule((options?: ChurnOptions) => new ChurnRule(options));
