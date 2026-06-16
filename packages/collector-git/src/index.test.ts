import { describe, expect, test } from 'bun:test';
import { convertGitFileStatus, GitHumanReadableFileStatus, parseGitLog } from './index';

const SEP = '\x01';

function commitLine(hash: string, author: string, email: string, date: string, subject: string): string {
	return `COMMIT${SEP}${hash}${SEP}${author}${SEP}${email}${SEP}${date}${SEP}${subject}`;
}

// ── parseGitLog ───────────────────────────────────────────────────────────────

describe('parseGitLog()', () => {
	test('empty output → empty result', () => {
		const result = parseGitLog('');
		expect(result.commits).toHaveLength(0);
		expect(result.fileChanges).toHaveLength(0);
	});

	test('single commit with added and modified files', () => {
		const output = [
			commitLine('abc123', 'Alice', 'alice@example.com', '2024-01-01T10:00:00+00:00', 'Add feature'),
			'',
			'A\tsrc/new.ts',
			'M\tsrc/existing.ts',
		].join('\n');

		const { commits, fileChanges } = parseGitLog(output);
		expect(commits).toHaveLength(1);
		expect(commits[0]).toMatchObject({
			hash: 'abc123',
			author: 'Alice',
			authorEmail: 'alice@example.com',
			subject: 'Add feature',
		});
		expect(fileChanges).toHaveLength(2);
		expect(fileChanges[0]).toMatchObject({
			hash: 'abc123',
			path: 'src/new.ts',
			status: GitHumanReadableFileStatus.Added,
		});
		expect(fileChanges[1]).toMatchObject({
			hash: 'abc123',
			path: 'src/existing.ts',
			status: GitHumanReadableFileStatus.Modified,
		});
	});

	test('deleted file', () => {
		const output = [
			commitLine('def456', 'Bob', 'bob@example.com', '2024-01-02T10:00:00+00:00', 'Remove old file'),
			'',
			'D\tsrc/old.ts',
		].join('\n');

		const { fileChanges } = parseGitLog(output);
		expect(fileChanges[0]).toMatchObject({
			hash: 'def456',
			path: 'src/old.ts',
			status: GitHumanReadableFileStatus.Deleted,
		});
	});

	test('renamed file carries oldPath', () => {
		const output = [
			commitLine('ghi789', 'Carol', 'carol@example.com', '2024-01-03T10:00:00+00:00', 'Rename login to signin'),
			'',
			'R90\tsrc/login.ts\tsrc/signin.ts',
		].join('\n');

		const { fileChanges } = parseGitLog(output);
		expect(fileChanges[0]).toMatchObject({
			hash: 'ghi789',
			path: 'src/signin.ts',
			status: GitHumanReadableFileStatus.Renamed,
			oldPath: 'src/login.ts',
		});
	});

	test('multiple commits', () => {
		const output = [
			commitLine('aaa', 'Alice', 'a@example.com', '2024-01-01T10:00:00+00:00', 'First'),
			'',
			'M\tsrc/a.ts',
			'',
			commitLine('bbb', 'Bob', 'b@example.com', '2024-01-02T10:00:00+00:00', 'Second'),
			'',
			'A\tsrc/b.ts',
		].join('\n');

		const { commits, fileChanges } = parseGitLog(output);
		expect(commits).toHaveLength(2);
		expect(fileChanges).toHaveLength(2);
		expect(fileChanges[0]?.hash).toBe('aaa');
		expect(fileChanges[1]?.hash).toBe('bbb');
	});

	test('subject containing the separator character is preserved', () => {
		const output = [
			commitLine('zzz', 'Alice', 'a@example.com', '2024-01-01T10:00:00+00:00', `Fix\x01weird subject`),
		].join('\n');
		const { commits } = parseGitLog(output);
		expect(commits[0]?.subject).toBe('Fix\x01weird subject');
	});

	test('lines with unknown status codes are ignored', () => {
		const output = [
			commitLine('abc', 'Alice', 'a@example.com', '2024-01-01T10:00:00+00:00', 'Commit'),
			'',
			'X\tsrc/file.ts',
			'M\tsrc/real.ts',
		].join('\n');

		const { fileChanges } = parseGitLog(output);
		expect(fileChanges).toHaveLength(1);
		expect(fileChanges[0]?.path).toBe('src/real.ts');
	});

	test('copied file carries oldPath', () => {
		const output = [
			commitLine('jkl012', 'Dave', 'dave@example.com', '2024-01-04T10:00:00+00:00', 'Copy config'),
			'',
			'C85\tconfig/base.json\tconfig/override.json',
		].join('\n');

		const { fileChanges } = parseGitLog(output);
		expect(fileChanges).toHaveLength(1);
		expect(fileChanges[0]).toMatchObject({
			hash: 'jkl012',
			path: 'config/override.json',
			status: GitHumanReadableFileStatus.Copied,
			oldPath: 'config/base.json',
		});
	});

	test('commit with no file changes', () => {
		const output = [
			commitLine('nochanges', 'Alice', 'a@example.com', '2024-01-01T10:00:00+00:00', 'Empty commit'),
		].join('\n');

		const { commits, fileChanges } = parseGitLog(output);
		expect(commits).toHaveLength(1);
		expect(fileChanges).toHaveLength(0);
	});

	test('trailing and leading blank lines are ignored', () => {
		const output = [
			'',
			'',
			commitLine('trim', 'Alice', 'a@example.com', '2024-01-01T10:00:00+00:00', 'Trim test'),
			'',
			'A\tsrc/file.ts',
			'',
			'',
		].join('\n');

		const { commits, fileChanges } = parseGitLog(output);
		expect(commits).toHaveLength(1);
		expect(fileChanges).toHaveLength(1);
	});

	test('file changes before any commit line are ignored', () => {
		const output = [
			'A\tsrc/orphan.ts',
			'',
			commitLine('first', 'Alice', 'a@example.com', '2024-01-01T10:00:00+00:00', 'First'),
		].join('\n');

		const { commits, fileChanges } = parseGitLog(output);
		expect(commits).toHaveLength(1);
		expect(fileChanges).toHaveLength(0);
	});

	test('incomplete commit line is skipped', () => {
		const output = [
			`COMMIT${SEP}${SEP}Alice${SEP}a@example.com${SEP}2024-01-01T10:00:00+00:00${SEP}Missing hash`,
			'',
			'A\tsrc/file.ts',
		].join('\n');

		const { commits, fileChanges } = parseGitLog(output);
		expect(commits).toHaveLength(0);
		expect(fileChanges).toHaveLength(0);
	});

	test('file line without tab separator is ignored', () => {
		const output = [
			commitLine('abc', 'Alice', 'a@example.com', '2024-01-01T10:00:00+00:00', 'Bad line'),
			'',
			'Msrc/missing-tab.ts',
		].join('\n');

		const { fileChanges } = parseGitLog(output);
		expect(fileChanges).toHaveLength(0);
	});

	test('renamed line missing paths is ignored', () => {
		const output = [
			commitLine('abc', 'Alice', 'a@example.com', '2024-01-01T10:00:00+00:00', 'Incomplete rename'),
			'',
			'R100\tsrc/only-old.ts',
		].join('\n');

		const { fileChanges } = parseGitLog(output);
		expect(fileChanges).toHaveLength(0);
	});

	test('empty subject is preserved', () => {
		const output = [commitLine('empty', 'Alice', 'a@example.com', '2024-01-01T10:00:00+00:00', '')].join('\n');

		const { commits } = parseGitLog(output);
		expect(commits[0]?.subject).toBe('');
	});

	test('multiple separators in subject are preserved', () => {
		const output = [commitLine('multi', 'Alice', 'a@example.com', '2024-01-01T10:00:00+00:00', `a${SEP}b${SEP}c`)].join(
			'\n',
		);

		const { commits } = parseGitLog(output);
		expect(commits[0]?.subject).toBe(`a${SEP}b${SEP}c`);
	});
});

// ── convertGitFileStatus ──────────────────────────────────────────────────────

describe('convertGitFileStatus()', () => {
	test('maps every known status code', () => {
		expect(convertGitFileStatus('A')).toBe(GitHumanReadableFileStatus.Added);
		expect(convertGitFileStatus('M')).toBe(GitHumanReadableFileStatus.Modified);
		expect(convertGitFileStatus('D')).toBe(GitHumanReadableFileStatus.Deleted);
		expect(convertGitFileStatus('R')).toBe(GitHumanReadableFileStatus.Renamed);
		expect(convertGitFileStatus('C')).toBe(GitHumanReadableFileStatus.Copied);
	});

	test('throws on unknown status code', () => {
		expect(() => convertGitFileStatus('X')).toThrow('Unknown git file status: X');
	});
});
