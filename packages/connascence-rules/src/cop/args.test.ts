import { describe, expect, test } from 'bun:test';
import type { FunctionSignature, Parameter } from '@maat-tools/vocabulary';
import { ConnascenceOfPositionArgsRule } from './args';

function makeParam(name: string, type: string, position: number): Parameter {
	return { name, type, position };
}

function makeInput(params: Parameter[]): FunctionSignature['input'] {
	return { parameters: params, heterogeneous: false };
}

function makeFunctionSignature(overrides: Partial<FunctionSignature> = {}): FunctionSignature {
	return {
		file: '/src/index.ts',
		name: 'sendEmail',
		input: makeInput([
			makeParam('firstName', 'string', 0),
			makeParam('lastName', 'string', 1),
			makeParam('email', 'string', 2),
			makeParam('subject', 'string', 3),
			makeParam('body', 'string', 4),
		]),
		output: {
			returnType: 'void',
			heterogeneous: false,
			returnSites: [],
		},
		location: { file: '/src/index.ts', line: 10, column: 5 },
		exported: true,
		...overrides,
	};
}

describe('ConnascenceOfPositionArgsRule.evaluate()', () => {
	test('function with boolean → finding produced (default on)', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					input: makeInput([makeParam('name', 'string', 0), makeParam('active', 'boolean', 1)]),
				}),
			],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('maat-tools/connascence-rules/cop-args@v1');
		expect(findings[0]?.message).toContain('contains boolean param');
	});

	test('function with 4 params → finding produced (default maxParams=3)', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					input: makeInput([
						makeParam('a', 'string', 0),
						makeParam('b', 'string', 1),
						makeParam('c', 'string', 2),
						makeParam('d', 'string', 3),
					]),
				}),
			],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('4 params exceeds threshold of 3');
	});

	test('function with exactly maxArgumentsAllowed params and no boolean → no finding', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					input: makeInput([makeParam('a', 'string', 0), makeParam('b', 'string', 1), makeParam('c', 'string', 2)]),
				}),
			],
		});
		expect(findings).toHaveLength(0);
	});

	test('flagBoolean: false — boolean param not flagged', () => {
		const rule = new ConnascenceOfPositionArgsRule({ flagBoolean: false });
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					input: makeInput([makeParam('name', 'string', 0), makeParam('active', 'boolean', 1)]),
				}),
			],
		});
		expect(findings).toHaveLength(0);
	});

	test('maxArgumentsAllowed: 5 — function with 4 params not flagged', () => {
		const rule = new ConnascenceOfPositionArgsRule({ maxArgumentsAllowed: 5 });
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					input: makeInput([
						makeParam('a', 'string', 0),
						makeParam('b', 'string', 1),
						makeParam('c', 'string', 2),
						makeParam('d', 'string', 3),
					]),
				}),
			],
		});
		expect(findings).toHaveLength(0);
	});

	test('both triggers → single finding with both reasons', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					input: makeInput([
						makeParam('a', 'string', 0),
						makeParam('b', 'string', 1),
						makeParam('c', 'string', 2),
						makeParam('d', 'boolean', 3),
					]),
				}),
			],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('contains boolean param');
		expect(findings[0]?.message).toContain('4 params exceeds threshold of 3');
	});

	test('ruleIdentifier includes function name and params', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [makeFunctionSignature()],
		});
		expect(findings[0]?.ruleIdentifier).toHaveProperty('function', 'sendEmail');
		expect(findings[0]?.ruleIdentifier).toHaveProperty('params');
	});

	test('empty input → no findings', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({ functionSignatures: [] });
		expect(findings).toHaveLength(0);
	});

	test('multiple signatures → multiple findings', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({ name: 'fnA', input: makeInput([makeParam('x', 'boolean', 0)]) }),
				makeFunctionSignature({
					name: 'fnB',
					input: makeInput([
						makeParam('a', 'string', 0),
						makeParam('b', 'string', 1),
						makeParam('c', 'string', 2),
						makeParam('d', 'string', 3),
					]),
				}),
			],
		});
		expect(findings).toHaveLength(2);
	});

	test('onlyExported: true (default) — non-exported function skipped', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					exported: false,
					input: makeInput([makeParam('x', 'boolean', 0)]),
				}),
			],
		});
		expect(findings).toHaveLength(0);
	});

	test('onlyExported: false — non-exported function flagged', () => {
		const rule = new ConnascenceOfPositionArgsRule({ onlyExported: false });
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					exported: false,
					input: makeInput([makeParam('x', 'boolean', 0)]),
				}),
			],
		});
		expect(findings).toHaveLength(1);
	});

	// ── edge cases ────────────────────────────────────────────────────────────────

	test('union type containing boolean (e.g. "boolean | undefined") → not flagged', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					input: makeInput([makeParam('name', 'string', 0), makeParam('active', 'boolean | undefined', 1)]),
				}),
			],
		});
		expect(findings).toHaveLength(0);
	});

	test('zero-parameter function → no finding', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [makeFunctionSignature({ input: makeInput([]) })],
		});
		expect(findings).toHaveLength(0);
	});

	test('maxArgumentsAllowed: 0 — any function with params is flagged', () => {
		const rule = new ConnascenceOfPositionArgsRule({ maxArgumentsAllowed: 0 });
		const findings = rule.evaluate({
			functionSignatures: [makeFunctionSignature({ input: makeInput([makeParam('x', 'string', 0)]) })],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('1 params exceeds threshold of 0');
	});

	test('no callers → finding produced without caller info', () => {
		const rule = new ConnascenceOfPositionArgsRule();
		const findings = rule.evaluate({
			functionSignatures: [
				makeFunctionSignature({
					input: makeInput([makeParam('x', 'boolean', 0)]),
				}),
			],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).not.toContain('called from');
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
