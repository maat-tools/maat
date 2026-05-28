import { describe, expect, test } from 'bun:test';
import { type GitCommit, type GitFileChange, GitHumanReadableFileStatus } from '@maat-tools/collector-git';
import { ChurnRule } from './churn';

const DAYS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): string {
	return new Date(Date.now() - n * DAYS).toISOString();
}

function makeCommit(hash: string, daysBack: number): GitCommit {
	return { hash, author: 'Alice', authorEmail: 'alice@example.com', date: daysAgo(daysBack), subject: 'chore' };
}

function makeChange(
	hash: string,
	path: string,
	status: GitHumanReadableFileStatus = GitHumanReadableFileStatus.Modified,
): GitFileChange {
	return { hash, path, status };
}

// ── evaluate ──────────────────────────────────────────────────────────────────

describe('ChurnRule.evaluate()', () => {
	test('below threshold → no findings', () => {
		const rule = new ChurnRule({ threshold: 5, windowDays: 90 });
		const commits = [makeCommit('a', 1), makeCommit('b', 2), makeCommit('c', 3)];
		const fileChanges = commits.map((c) => makeChange(c.hash, 'src/index.ts'));

		expect(rule.evaluate({ git_commits: commits, git_file_changes: fileChanges })).toHaveLength(0);
	});

	test('at threshold → finding produced', () => {
		const rule = new ChurnRule({ threshold: 3, windowDays: 90 });
		const commits = [makeCommit('a', 1), makeCommit('b', 2), makeCommit('c', 3)];
		const fileChanges = commits.map((c) => makeChange(c.hash, 'src/index.ts'));

		const findings = rule.evaluate({ git_commits: commits, git_file_changes: fileChanges });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('maat-tools/git-rules/churn@v1');
	});

	test('commits outside window are excluded', () => {
		const rule = new ChurnRule({ threshold: 3, windowDays: 30 });
		const commits = [
			makeCommit('a', 5),
			makeCommit('b', 10),
			makeCommit('c', 60), // outside 30-day window
		];
		const fileChanges = commits.map((c) => makeChange(c.hash, 'src/index.ts'));

		expect(rule.evaluate({ git_commits: commits, git_file_changes: fileChanges })).toHaveLength(0);
	});

	test('finding message includes file path and change count', () => {
		const rule = new ChurnRule({ threshold: 2, windowDays: 90 });
		const commits = [makeCommit('a', 1), makeCommit('b', 2)];
		const fileChanges = commits.map((c) => makeChange(c.hash, 'src/utils.ts'));

		const findings = rule.evaluate({ git_commits: commits, git_file_changes: fileChanges });
		expect(findings[0]?.message).toContain('src/utils.ts');
		expect(findings[0]?.message).toContain('2 times');
	});

	test('different files tracked independently', () => {
		const rule = new ChurnRule({ threshold: 2, windowDays: 90 });
		const commits = [makeCommit('a', 1), makeCommit('b', 2), makeCommit('c', 3)];
		const fileChanges = [
			makeChange('a', 'src/churny.ts'),
			makeChange('b', 'src/churny.ts'),
			makeChange('c', 'src/stable.ts'),
		];

		const findings = rule.evaluate({ git_commits: commits, git_file_changes: fileChanges });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ path: 'src/churny.ts' });
	});

	test('excluded glob patterns are not counted', () => {
		const rule = new ChurnRule({ threshold: 2, windowDays: 90, exclude: ['src/generated/**'] });
		const commits = [makeCommit('a', 1), makeCommit('b', 2)];
		const fileChanges = [makeChange('a', 'src/generated/schema.ts'), makeChange('b', 'src/generated/schema.ts')];

		expect(rule.evaluate({ git_commits: commits, git_file_changes: fileChanges })).toHaveLength(0);
	});

	test('exclude only suppresses matched paths, others still count', () => {
		const rule = new ChurnRule({ threshold: 2, windowDays: 90, exclude: ['src/generated/**'] });
		const commits = [makeCommit('a', 1), makeCommit('b', 2)];
		const fileChanges = [makeChange('a', 'src/generated/schema.ts'), makeChange('b', 'src/index.ts')];

		// generated is excluded, index.ts appears only once — nothing over threshold
		expect(rule.evaluate({ git_commits: commits, git_file_changes: fileChanges })).toHaveLength(0);
	});

	test('ruleIdentifier fingerprints on file path', () => {
		const rule = new ChurnRule({ threshold: 2, windowDays: 90 });
		const commits = [makeCommit('a', 1), makeCommit('b', 2)];
		const fileChanges = commits.map((c) => makeChange(c.hash, 'src/index.ts'));

		const findings = rule.evaluate({ git_commits: commits, git_file_changes: fileChanges });
		expect(findings[0]?.ruleIdentifier).toEqual({ path: 'src/index.ts' });
	});
});

// ── describeArtifact ──────────────────────────────────────────────────────────

describe('ChurnRule.describeArtifact()', () => {
	const rule = new ChurnRule();

	test('git-churn artifact → file and changes', () => {
		const result = rule.describeArtifact({ kind: 'git-churn', data: { path: 'src/index.ts', count: 42 } });
		expect(result).toEqual({ file: 'src/index.ts', changes: '42' });
	});

	test('unknown kind → stringified data', () => {
		const result = rule.describeArtifact({ kind: 'other', data: 'raw' });
		expect(result).toEqual({ value: 'raw' });
	});
});
