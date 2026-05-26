import { describe, expect, test } from 'bun:test';
import type { CallGraph, FunctionSignature, Parameter } from '@maat-tools/vocabulary';
import { ConnascenceOfPositionArgsRule } from './args';

function makeParam(name: string, type: string, position: number): Parameter {
	return { name, type, position };
}

function makeFunctionSignature(overrides: Partial<FunctionSignature> = {}): FunctionSignature {
	return {
		file: '/src/index.ts',
		functionName: 'sendEmail',
		parameters: [
			makeParam('firstName', 'string', 0),
			makeParam('lastName', 'string', 1),
			makeParam('email', 'string', 2),
			makeParam('subject', 'string', 3),
			makeParam('body', 'string', 4),
		],
		heterogeneousTypes: false,
		location: { file: '/src/index.ts', line: 10, column: 5 },
		isExported: true,
		...overrides,
	};
}

function makeCallGraph(overrides: Partial<CallGraph> = {}): CallGraph {
	return {
		nodes: [],
		edges: [],
		...overrides,
	};
}

function makeCallEdge(overrides: Partial<CallGraph['edges'][number]> = {}): CallGraph['edges'][number] {
	return {
		callerId: '/src/caller.ts:1:1',
		calleeId: '/src/index.ts:10:5',
		location: { file: '/src/caller.ts', line: 1, column: 1 },
		...overrides,
	};
}

describe('ConnascenceOfPositionArgsRule.evaluate()', () => {
	test('function with boolean → finding produced (default on)', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					parameters: [makeParam('name', 'string', 0), makeParam('active', 'boolean', 1)],
				}),
			],
			callGraph: makeCallGraph({
				edges: [makeCallEdge({ calleeId: '/src/index.ts:10:5', location: { file: '/src/caller.ts', line: 1 } })],
			}),
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('cop-args@v1');
		expect(findings[0]?.message).toContain('contains boolean param');
	});

	test('function with 4 params → finding produced (default maxParams=3)', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					parameters: [
						makeParam('a', 'string', 0),
						makeParam('b', 'string', 1),
						makeParam('c', 'string', 2),
						makeParam('d', 'string', 3),
					],
				}),
			],
			callGraph: makeCallGraph({
				edges: [makeCallEdge({ calleeId: '/src/index.ts:10:5', location: { file: '/src/caller.ts', line: 1 } })],
			}),
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('4 params exceeds threshold of 3');
	});

	test('function with exactly maxArgumentsAllowed params and no boolean → no finding', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					parameters: [makeParam('a', 'string', 0), makeParam('b', 'string', 1), makeParam('c', 'string', 2)],
				}),
			],
			callGraph: makeCallGraph(),
		});
		expect(findings).toHaveLength(0);
	});

	test('flagBoolean: false — boolean param not flagged', () => {
		const rule = new ConnascenceOfPositionArgsRule({ flagBoolean: false });
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					parameters: [makeParam('name', 'string', 0), makeParam('active', 'boolean', 1)],
				}),
			],
			callGraph: makeCallGraph({
				edges: [makeCallEdge({ calleeId: '/src/index.ts:10:5', location: { file: '/src/caller.ts', line: 1 } })],
			}),
		});
		expect(findings).toHaveLength(0);
	});

	test('maxArgumentsAllowed: 5 — function with 4 params not flagged', () => {
		const rule = new ConnascenceOfPositionArgsRule({ maxArgumentsAllowed: 5 });
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					parameters: [
						makeParam('a', 'string', 0),
						makeParam('b', 'string', 1),
						makeParam('c', 'string', 2),
						makeParam('d', 'string', 3),
					],
				}),
			],
			callGraph: makeCallGraph(),
		});
		expect(findings).toHaveLength(0);
	});

	test('both triggers → single finding with both reasons', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					parameters: [
						makeParam('a', 'string', 0),
						makeParam('b', 'string', 1),
						makeParam('c', 'string', 2),
						makeParam('d', 'boolean', 3),
					],
				}),
			],
			callGraph: makeCallGraph({
				edges: [makeCallEdge({ calleeId: '/src/index.ts:10:5', location: { file: '/src/caller.ts', line: 1 } })],
			}),
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('contains boolean param');
		expect(findings[0]?.message).toContain('4 params exceeds threshold of 3');
	});

	test('ruleIdentifier includes function name and params', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [makeFunctionSignature()],
			callGraph: makeCallGraph({
				edges: [makeCallEdge({ calleeId: '/src/index.ts:10:5', location: { file: '/src/caller.ts', line: 1 } })],
			}),
		});
		expect(findings[0]?.ruleIdentifier).toHaveProperty('function', 'sendEmail');
		expect(findings[0]?.ruleIdentifier).toHaveProperty('params');
	});

	test('empty input → no findings', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({ functionSignatures: [], callGraph: makeCallGraph() });
		expect(findings).toHaveLength(0);
	});

	test('multiple signatures → multiple findings', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({ functionName: 'fnA', parameters: [makeParam('x', 'boolean', 0)] }),
				makeFunctionSignature({
					functionName: 'fnB',
					parameters: [
						makeParam('a', 'string', 0),
						makeParam('b', 'string', 1),
						makeParam('c', 'string', 2),
						makeParam('d', 'string', 3),
					],
				}),
			],
			callGraph: makeCallGraph({
				edges: [
					makeCallEdge({ calleeId: '/src/index.ts:10:5', location: { file: '/src/caller.ts', line: 1 } }),
					makeCallEdge({ calleeId: '/src/index.ts:20:5', location: { file: '/src/caller.ts', line: 5 } }),
				],
			}),
		});
		expect(findings).toHaveLength(2);
	});

	test('onlyExported: true (default) — non-exported function skipped', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					isExported: false,
					parameters: [makeParam('x', 'boolean', 0)],
				}),
			],
			callGraph: makeCallGraph(),
		});
		expect(findings).toHaveLength(0);
	});

	test('onlyExported: false — non-exported function flagged', () => {
		const rule = new ConnascenceOfPositionArgsRule({ onlyExported: false });
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					isExported: false,
					parameters: [makeParam('x', 'boolean', 0)],
				}),
			],
			callGraph: makeCallGraph({
				edges: [makeCallEdge({ calleeId: '/src/index.ts:10:5', location: { file: '/src/caller.ts', line: 1 } })],
			}),
		});
		expect(findings).toHaveLength(1);
	});

	// ── edge cases ────────────────────────────────────────────────────────────

	test('union type containing boolean (e.g. "boolean | undefined") → not flagged', () => {
		// The check is strict === 'boolean', so compound types slip through.
		// This test documents that behavior explicitly.
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					parameters: [makeParam('name', 'string', 0), makeParam('active', 'boolean | undefined', 1)],
				}),
			],
			callGraph: makeCallGraph(),
		});
		expect(findings).toHaveLength(0);
	});

	test('zero-parameter function → no finding', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [makeFunctionSignature({ parameters: [] })],
			callGraph: makeCallGraph(),
		});
		expect(findings).toHaveLength(0);
	});

	test('maxArgumentsAllowed: 0 — any function with params is flagged', () => {
		const rule = new ConnascenceOfPositionArgsRule({ maxArgumentsAllowed: 0 });
		const findings = rule.evaluate({
			functionSignatures: [makeFunctionSignature({ parameters: [makeParam('x', 'string', 0)] })],
			callGraph: makeCallGraph({
				edges: [makeCallEdge({ calleeId: '/src/index.ts:10:5', location: { file: '/src/caller.ts', line: 1 } })],
			}),
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('1 params exceeds threshold of 0');
	});

	// ── call graph enrichment ─────────────────────────────────────────────────

	test('no callers → finding produced without caller info', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					parameters: [makeParam('x', 'boolean', 0)],
				}),
			],
			callGraph: makeCallGraph(),
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).not.toContain('called from');
	});

	test('same-file caller → finding produced without caller info', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					parameters: [makeParam('x', 'boolean', 0)],
				}),
			],
			callGraph: makeCallGraph({
				edges: [
					makeCallEdge({
						callerId: '/src/index.ts:5:1',
						calleeId: '/src/index.ts:10:5',
						location: { file: '/src/index.ts', line: 5 },
					}),
				],
			}),
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).not.toContain('called from');
	});

	test('cross-file caller → finding includes caller count and chain depth', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					parameters: [makeParam('x', 'boolean', 0)],
				}),
			],
			callGraph: makeCallGraph({
				edges: [
					makeCallEdge({
						callerId: '/src/caller.ts:5:1',
						calleeId: '/src/index.ts:10:5',
						location: { file: '/src/caller.ts', line: 5 },
					}),
				],
			}),
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('called from 1 file');
		expect(findings[0]?.message).toContain('max chain depth: 1');
	});

	test('multiple cross-file callers → correct count', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					parameters: [makeParam('x', 'boolean', 0)],
				}),
			],
			callGraph: makeCallGraph({
				edges: [
					makeCallEdge({
						callerId: '/src/a.ts:5:1',
						calleeId: '/src/index.ts:10:5',
						location: { file: '/src/a.ts', line: 5 },
					}),
					makeCallEdge({
						callerId: '/src/b.ts:10:1',
						calleeId: '/src/index.ts:10:5',
						location: { file: '/src/b.ts', line: 10 },
					}),
				],
			}),
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('called from 2 file');
	});

	test('deep call chain → correct max depth', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					parameters: [makeParam('x', 'boolean', 0)],
					file: '/src/c.ts',
					location: { file: '/src/c.ts', line: 10 },
				}),
			],
			callGraph: makeCallGraph({
				edges: [
					makeCallEdge({
						callerId: '/src/b.ts:5:1',
						calleeId: '/src/c.ts:10:5',
						location: { file: '/src/b.ts', line: 5 },
					}),
					makeCallEdge({
						callerId: '/src/a.ts:3:1',
						calleeId: '/src/b.ts:5:1',
						location: { file: '/src/a.ts', line: 3 },
					}),
				],
			}),
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('max chain depth: 2');
	});
});

describe('ConnascenceOfPositionArgsRule.describeArtifact()', () => {
	const rule = new ConnascenceOfPositionArgsRule();

	test('source artifact with column → location includes column', () => {
		const sig = makeFunctionSignature({
			location: { file: '/src/email.ts', line: 42, column: 7 },
		});
		const described = rule.describeArtifact({ kind: 'source', data: sig });
		expect(described.location).toBe('/src/email.ts:42:7');
		expect(described.function).toBe('sendEmail');
		expect(described.parameters).toContain('firstName: string');
	});

	test('source artifact without column → location omits column', () => {
		const sig = makeFunctionSignature({
			location: { file: '/src/email.ts', line: 42 },
		});
		const described = rule.describeArtifact({ kind: 'source', data: sig });
		expect(described.location).toBe('/src/email.ts:42');
	});

	test('unknown kind → returns stringified data', () => {
		const described = rule.describeArtifact({ kind: 'other', data: 'raw' });
		expect(described).toEqual({ value: 'raw' });
	});
});
