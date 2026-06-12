import micromatch from 'micromatch';

export function isMatch(path: string, patterns: string | string[]): boolean {
	return micromatch.isMatch(path, patterns);
}
