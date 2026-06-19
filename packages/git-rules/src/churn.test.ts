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

		expect(rule.evaluate({ gitCommits: commits, gitFileChanges: fileChanges })).toHaveLength(0);
	});

	test('at threshold → finding produced', () => {
		const rule = new ChurnRule({ threshold: 3, windowDays: 90 });
		const commits = [makeCommit('a', 1), makeCommit('b', 2), makeCommit('c', 3)];
		const fileChanges = commits.map((c) => makeChange(c.hash, 'src/index.ts'));

		const { findings } = rule.evaluate({ gitCommits: commits, gitFileChanges: fileChanges });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('maat-tools/git-rules/churn@v1');
	});

	test('above threshold → finding includes exact count', () => {
		const rule = new ChurnRule({ threshold: 2, windowDays: 90 });
		const commits = [makeCommit('a', 1), makeCommit('b', 2), makeCommit('c', 3), makeCommit('d', 4)];
		const fileChanges = commits.map((c) => makeChange(c.hash, 'src/index.ts'));

		const { findings } = rule.evaluate({ gitCommits: commits, gitFileChanges: fileChanges });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('4 times');
	});

	test('commits outside window are excluded', () => {
		const rule = new ChurnRule({ threshold: 3, windowDays: 30 });
		const commits = [
			makeCommit('a', 5),
			makeCommit('b', 10),
			makeCommit('c', 60), // outside 30-day window
		];
		const fileChanges = commits.map((c) => makeChange(c.hash, 'src/index.ts'));

		expect(rule.evaluate({ gitCommits: commits, gitFileChanges: fileChanges })).toHaveLength(0);
	});

	test('changes with hash not present in commits are ignored', () => {
		const rule = new ChurnRule({ threshold: 1, windowDays: 90 });
		const commits = [makeCommit('a', 1)];
		const fileChanges = [makeChange('a', 'src/index.ts'), makeChange('z', 'src/orphan.ts')];

		const { findings } = rule.evaluate({ gitCommits: commits, gitFileChanges: fileChanges });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ path: 'src/index.ts' });
	});

	test('empty inputs → no findings', () => {
		const rule = new ChurnRule({ threshold: 1, windowDays: 90 });
		expect(rule.evaluate({ gitCommits: [], gitFileChanges: [] })).toHaveLength(0);
	});

	test('threshold of 1 flags any in-window change', () => {
		const rule = new ChurnRule({ threshold: 1, windowDays: 90 });
		const commits = [makeCommit('a', 1)];
		const fileChanges = [makeChange('a', 'src/index.ts')];

		const { findings } = rule.evaluate({ gitCommits: commits, gitFileChanges: fileChanges });
		expect(findings).toHaveLength(1);
	});

	test('windowDays of 0 only includes changes from today', () => {
		const rule = new ChurnRule({ threshold: 1, windowDays: 0 });
		const todayCommit = makeCommit('a', 0);
		const yesterdayCommit = makeCommit('b', 1);
		const commits = [todayCommit, yesterdayCommit];
		const fileChanges = [makeChange('a', 'src/today.ts'), makeChange('b', 'src/yesterday.ts')];

		const { findings } = rule.evaluate({ gitCommits: commits, gitFileChanges: fileChanges });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ path: 'src/today.ts' });
	});

	test('finding message includes file path and change count', () => {
		const rule = new ChurnRule({ threshold: 2, windowDays: 90 });
		const commits = [makeCommit('a', 1), makeCommit('b', 2)];
		const fileChanges = commits.map((c) => makeChange(c.hash, 'src/utils.ts'));

		const { findings } = rule.evaluate({ gitCommits: commits, gitFileChanges: fileChanges });
		expect(findings[0]?.message).toContain('src/utils.ts');
		expect(findings[0]?.message).toContain('2 times');
		expect(findings[0]?.message).toContain('90 days');
	});

	test('different files tracked independently', () => {
		const rule = new ChurnRule({ threshold: 2, windowDays: 90 });
		const commits = [makeCommit('a', 1), makeCommit('b', 2), makeCommit('c', 3)];
		const fileChanges = [
			makeChange('a', 'src/churny.ts'),
			makeChange('b', 'src/churny.ts'),
			makeChange('c', 'src/stable.ts'),
		];

		const { findings } = rule.evaluate({ gitCommits: commits, gitFileChanges: fileChanges });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ path: 'src/churny.ts' });
	});

	test('multiple files above threshold → multiple findings', () => {
		const rule = new ChurnRule({ threshold: 2, windowDays: 90 });
		const commits = [makeCommit('a', 1), makeCommit('b', 2), makeCommit('c', 3)];
		const fileChanges = [
			makeChange('a', 'src/a.ts'),
			makeChange('b', 'src/a.ts'),
			makeChange('c', 'src/a.ts'),
			makeChange('a', 'src/b.ts'),
			makeChange('b', 'src/b.ts'),
			makeChange('c', 'src/b.ts'),
		];

		const { findings } = rule.evaluate({ gitCommits: commits, gitFileChanges: fileChanges });
		expect(findings).toHaveLength(2);
		const paths = findings.map((f) => (f.ruleIdentifier as { path: string }).path).sort();
		expect(paths).toEqual(['src/a.ts', 'src/b.ts']);
	});

	test('excluded glob patterns are not counted', () => {
		const rule = new ChurnRule({ threshold: 2, windowDays: 90, exclude: ['src/generated/**'] });
		const commits = [makeCommit('a', 1), makeCommit('b', 2)];
		const fileChanges = [makeChange('a', 'src/generated/schema.ts'), makeChange('b', 'src/generated/schema.ts')];

		expect(rule.evaluate({ gitCommits: commits, gitFileChanges: fileChanges })).toHaveLength(0);
	});

	test('exclude only suppresses matched paths, others still count', () => {
		const rule = new ChurnRule({ threshold: 2, windowDays: 90, exclude: ['src/generated/**'] });
		const commits = [makeCommit('a', 1), makeCommit('b', 2)];
		const fileChanges = [makeChange('a', 'src/generated/schema.ts'), makeChange('b', 'src/index.ts')];

		// generated is excluded, index.ts appears only once — nothing over threshold
		expect(rule.evaluate({ gitCommits: commits, gitFileChanges: fileChanges })).toHaveLength(0);
	});

	test('exclude as exact file pattern suppresses that file', () => {
		const rule = new ChurnRule({ threshold: 2, windowDays: 90, exclude: ['src/generated/schema.ts'] });
		const commits = [makeCommit('a', 1), makeCommit('b', 2)];
		const fileChanges = [makeChange('a', 'src/generated/schema.ts'), makeChange('b', 'src/generated/schema.ts')];

		expect(rule.evaluate({ gitCommits: commits, gitFileChanges: fileChanges })).toHaveLength(0);
	});

	test('multiple changes to the same file in the same commit count each entry', () => {
		const rule = new ChurnRule({ threshold: 2, windowDays: 90 });
		const commits = [makeCommit('a', 1)];
		const fileChanges = [makeChange('a', 'src/index.ts'), makeChange('a', 'src/index.ts')];

		const { findings } = rule.evaluate({ gitCommits: commits, gitFileChanges: fileChanges });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('2 times');
	});

	test('ruleIdentifier fingerprints on file path', () => {
		const rule = new ChurnRule({ threshold: 2, windowDays: 90 });
		const commits = [makeCommit('a', 1), makeCommit('b', 2)];
		const fileChanges = commits.map((c) => makeChange(c.hash, 'src/index.ts'));

		const { findings } = rule.evaluate({ gitCommits: commits, gitFileChanges: fileChanges });
		expect(findings[0]?.ruleIdentifier).toEqual({ path: 'src/index.ts' });
	});

	test('default options use threshold 10 and window 90 days', () => {
		const rule = new ChurnRule();
		const commits = Array.from({ length: 10 }, (_, i) => makeCommit(String(i), i));
		const fileChanges = commits.map((c) => makeChange(c.hash, 'src/index.ts'));

		const { findings } = rule.evaluate({ gitCommits: commits, gitFileChanges: fileChanges });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('10 times');
		expect(findings[0]?.message).toContain('90 days');
	});

	test('missing facts capabilities → treated as empty', () => {
		const rule = new ChurnRule({ threshold: 1, windowDays: 90 });
		const { findings } = rule.evaluate({
			gitCommits: undefined as unknown as GitCommit[],
			gitFileChanges: undefined as unknown as GitFileChange[],
		});
		expect(findings).toHaveLength(0);
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
