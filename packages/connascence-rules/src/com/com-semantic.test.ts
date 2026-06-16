import { describe, expect, test } from 'bun:test';
import type { CoMCandidate } from '@maat-tools/enricher-llm/com';
import type { FunctionSignature } from '@maat-tools/vocabulary';
import { ConnascenceOfMeaningSemanticRule } from './com-semantic';

function makeSignature(overrides: Partial<FunctionSignature> = {}): FunctionSignature {
	return {
		file: '/src/auth.ts',
		name: 'getRole',
		location: { file: '/src/auth.ts', line: 5, column: 1 },
		exported: true,
		input: { parameters: [], heterogeneous: false },
		output: {
			returnType: 'string',
			heterogeneous: true,
			returnSites: [
				{ value: '"admin"', location: { file: '/src/auth.ts', line: 6, column: 10 } },
				{ value: '"user"', location: { file: '/src/auth.ts', line: 8, column: 10 } },
			],
		},
		...overrides,
	};
}

function makeCandidate(
	overrides: Partial<CoMCandidate> & { signature?: Partial<FunctionSignature> } = {},
): CoMCandidate {
	return {
		signature: makeSignature(overrides.signature ?? {}),
		confidence: 0.9,
		reason: 'literal values encode implicit roles',
		...overrides,
	};
}

// ── constructor ──────────────────────────────────────────────────────────────

describe('ConnascenceOfMeaningSemanticRule constructor', () => {
	test('throws when threshold is missing', () => {
		expect(() => new ConnascenceOfMeaningSemanticRule()).toThrow('Threshold option is required');
	});

	test('throws when threshold is undefined', () => {
		expect(() => new ConnascenceOfMeaningSemanticRule(undefined)).toThrow('Threshold option is required');
	});
});

// ── evaluate ─────────────────────────────────────────────────────────────────

describe('ConnascenceOfMeaningSemanticRule.evaluate()', () => {
	test('no candidates → no findings', () => {
		const rule = new ConnascenceOfMeaningSemanticRule({ threshold: '0.5' });
		expect(rule.evaluate({ comCandidates: [] })).toHaveLength(0);
	});

	test('missing comCandidates capability → treated as empty', () => {
		const rule = new ConnascenceOfMeaningSemanticRule({ threshold: '0.5' });
		const findings = rule.evaluate({ comCandidates: undefined as unknown as CoMCandidate[] });
		expect(findings).toHaveLength(0);
	});

	test('confidence below threshold → no finding', () => {
		const rule = new ConnascenceOfMeaningSemanticRule({ threshold: '0.9' });
		const findings = rule.evaluate({ comCandidates: [makeCandidate({ confidence: 0.89 })] });
		expect(findings).toHaveLength(0);
	});

	test('confidence at threshold → finding produced', () => {
		const rule = new ConnascenceOfMeaningSemanticRule({ threshold: '0.9' });
		const findings = rule.evaluate({ comCandidates: [makeCandidate({ confidence: 0.9 })] });
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('maat-tools/connascence-rules/com-semantic@v1');
	});

	test('confidence above threshold → finding produced', () => {
		const rule = new ConnascenceOfMeaningSemanticRule({ threshold: '0.5' });
		const findings = rule.evaluate({ comCandidates: [makeCandidate({ confidence: 0.8 })] });
		expect(findings).toHaveLength(1);
	});

	test('message includes duplicated value, function name, file, reason and confidence', () => {
		const rule = new ConnascenceOfMeaningSemanticRule({ threshold: '0.5' });
		const findings = rule.evaluate({
			comCandidates: [
				makeCandidate({
					signature: makeSignature({
						name: 'resolveUser',
						file: '/src/users.ts',
						location: { file: '/src/users.ts', line: 10, column: 1 },
						output: {
							returnType: 'string',
							heterogeneous: true,
							returnSites: [
								{ value: '"missing"', location: { file: '/src/users.ts', line: 12, column: 5 } },
								{ value: '"missing"', location: { file: '/src/users.ts', line: 14, column: 5 } },
							],
						},
					}),
					confidence: 0.85,
					reason: 'sentinel reused',
				}),
			],
		});

		const message = findings[0]?.message ?? '';
		expect(message).toContain('"missing"');
		expect(message).toContain('resolveUser');
		expect(message).toContain('/src/users.ts');
		expect(message).toContain('sentinel reused');
		expect(message).toContain('0.85');
	});

	test('value string joins return sites with guard snippets', () => {
		const rule = new ConnascenceOfMeaningSemanticRule({ threshold: '0.5' });
		const findings = rule.evaluate({
			comCandidates: [
				makeCandidate({
					signature: makeSignature({
						output: {
							returnType: 'string',
							heterogeneous: true,
							returnSites: [
								{ value: '"admin"', guardSnippet: 'isAdmin', location: { file: '/src/auth.ts', line: 6, column: 10 } },
								{ value: '"user"', location: { file: '/src/auth.ts', line: 8, column: 10 } },
							],
						},
					}),
				}),
			],
		});

		expect(findings[0]?.ruleIdentifier).toMatchObject({ value: '"admin"[isAdmin]|"user"' });
	});

	test('duplicatedValues lists only values that appear more than once', () => {
		const rule = new ConnascenceOfMeaningSemanticRule({ threshold: '0.5' });
		const findings = rule.evaluate({
			comCandidates: [
				makeCandidate({
					signature: makeSignature({
						output: {
							returnType: 'string',
							heterogeneous: true,
							returnSites: [
								{ value: '"a"', location: { file: '/src/x.ts', line: 1, column: 1 } },
								{ value: '"a"', location: { file: '/src/x.ts', line: 2, column: 1 } },
								{ value: '"b"', location: { file: '/src/x.ts', line: 3, column: 1 } },
							],
						},
					}),
				}),
			],
		});

		expect(findings[0]?.message).toContain('"a"');
		expect(findings[0]?.message).not.toContain('"b"');
	});

	test('multiple candidates → multiple findings', () => {
		const rule = new ConnascenceOfMeaningSemanticRule({ threshold: '0.5' });
		const findings = rule.evaluate({
			comCandidates: [
				makeCandidate({ signature: makeSignature({ name: 'fnA' }) }),
				makeCandidate({ signature: makeSignature({ name: 'fnB' }) }),
			],
		});
		expect(findings).toHaveLength(2);
	});

	test('artifacts map every return site', () => {
		const rule = new ConnascenceOfMeaningSemanticRule({ threshold: '0.5' });
		const findings = rule.evaluate({
			comCandidates: [
				makeCandidate({
					signature: makeSignature({
						output: {
							returnType: 'string',
							heterogeneous: true,
							returnSites: [
								{ value: '"x"', location: { file: '/src/a.ts', line: 1, column: 1 } },
								{ value: '"y"', location: { file: '/src/a.ts', line: 2, column: 1 } },
								{ value: '"z"', location: { file: '/src/a.ts', line: 3, column: 1 } },
							],
						},
					}),
				}),
			],
		});

		expect(findings[0]?.artifacts).toHaveLength(3);
	});

	test('threshold of "1" only includes perfect confidence', () => {
		const rule = new ConnascenceOfMeaningSemanticRule({ threshold: '1' });
		const findings = rule.evaluate({
			comCandidates: [makeCandidate({ confidence: 1 }), makeCandidate({ confidence: 0.99 })],
		});
		expect(findings).toHaveLength(1);
	});
});

// ── describeArtifact ──────────────────────────────────────────────────────────

describe('ConnascenceOfMeaningSemanticRule.describeArtifact()', () => {
	const rule = new ConnascenceOfMeaningSemanticRule({ threshold: '0.5' });

	test('com-semantic artifact with column → location includes column', () => {
		const described = rule.describeArtifact({
			kind: 'com-semantic',
			data: { value: '"admin"', location: { file: '/src/auth.ts', line: 42, column: 7 } },
		});
		expect(described.location).toBe('/src/auth.ts:42:7');
		expect(described.value).toBe('"admin"');
	});

	test('com-semantic artifact without column → location omits column', () => {
		const described = rule.describeArtifact({
			kind: 'com-semantic',
			data: { value: '"admin"', location: { file: '/src/auth.ts', line: 42 } },
		});
		expect(described.location).toBe('/src/auth.ts:42');
	});

	test('unknown kind → returns stringified data', () => {
		const described = rule.describeArtifact({ kind: 'other', data: 'raw' });
		expect(described).toEqual({ value: 'raw' });
	});
});
