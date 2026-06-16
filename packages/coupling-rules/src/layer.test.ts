import { describe, expect, test } from 'bun:test';
import { isRule } from '@maat-tools/contracts';
import type { DependsOn } from '@maat-tools/vocabulary';
import { layer } from './layer';
import { Pure } from './roles';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeDep(
	fromPkg: string,
	toPath: string,
	opts: { fromPath?: string; fromRootPath?: string; toExternal?: boolean; toRootPath?: string } = {},
): DependsOn {
	const fromRootPath = opts.fromRootPath ?? `packages/${fromPkg.split('/').pop()}`;
	const fromPath = opts.fromPath ?? `${fromRootPath}/src/index.ts`;

	return {
		from: {
			path: fromPath,
			package: { name: fromPkg, rootPath: fromRootPath },
			location: { file: fromPath, line: 1, column: 1 },
		},
		to: {
			path: toPath,
			isExternal: opts.toExternal ?? true,
			package: opts.toRootPath ? { name: toPath, rootPath: opts.toRootPath } : undefined,
		},
	};
}

function makeFacts(deps: DependsOn[]) {
	return { dependsOn: deps };
}

// ─── LayerRule.evaluate() ─────────────────────────────────────────────────────

describe('LayerRule.evaluate() — allowlist', () => {
	test('no finding when dependency is in allows list', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/contracts')]));
		expect(findings).toHaveLength(0);
	});

	test('finding when dependency is NOT in allows list', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', 'uuid')]));
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('maat-tools/coupling-rules/layer-imports@v1');
	});

	test('no finding when source package does not match target', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/cli', 'uuid')]));
		expect(findings).toHaveLength(0);
	});

	test('allows() with empty list — any external dep is a finding', () => {
		const rule = layer('@maat-tools/contracts').allows().build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/contracts', 'node:crypto')]));
		expect(findings).toHaveLength(1);
	});

	test('string pattern does not match partial package name', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/contracts-extra')]));
		expect(findings).toHaveLength(1);
	});

	test('regexp pattern in allows list', () => {
		const rule = layer('@maat-tools/kernel')
			.allows(/^@maat-tools\//)
			.build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/contracts')]));
		expect(findings).toHaveLength(0);
	});

	test('regexp pattern — non-matching dependency is a finding', () => {
		const rule = layer('@maat-tools/kernel')
			.allows(/^@maat-tools\//)
			.build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', 'uuid')]));
		expect(findings).toHaveLength(1);
	});

	test('multiple deps — only disallowed ones produce findings', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts', '@maat-tools/core').build();
		const findings = rule.evaluate(
			makeFacts([
				makeDep('@maat-tools/kernel', '@maat-tools/contracts'),
				makeDep('@maat-tools/kernel', '@maat-tools/core'),
				makeDep('@maat-tools/kernel', 'uuid'),
				makeDep('@maat-tools/cli', 'uuid'), // different package — ignored
			]),
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ dependency: 'uuid' });
	});

	test('finding message includes target and dependency', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', 'uuid')]));
		expect(findings[0]?.message).toContain('@maat-tools/kernel');
		expect(findings[0]?.message).toContain('uuid');
	});

	test('internal dependency within target is not flagged', () => {
		const rule = layer('@maat-tools/kernel').allows().build();
		const findings = rule.evaluate(
			makeFacts([makeDep('@maat-tools/kernel', 'packages/kernel/src/internal.ts', { toExternal: false })]),
		);
		expect(findings).toHaveLength(0);
	});

	test('self-import via package name is not flagged', () => {
		const rule = layer('@maat-tools/kernel').allows().build();
		const findings = rule.evaluate(
			makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/kernel', { toExternal: true })]),
		);
		expect(findings).toHaveLength(0);
	});

	test('glob target matches files outside named package', () => {
		const rule = layer('packages/kernel/**').allows().build();
		const findings = rule.evaluate(
			makeFacts([
				makeDep('@maat-tools/kernel', 'uuid', { fromPath: 'packages/kernel/src/auth.ts' }),
				makeDep('@maat-tools/cli', 'uuid', { fromPath: 'packages/cli/src/index.ts' }),
			]),
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ target: 'packages/kernel/**' });
	});

	test('empty dependsOn → no findings', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		expect(rule.evaluate(makeFacts([]))).toHaveLength(0);
	});

	test('mixed string and regexp allows', () => {
		const rule = layer('@maat-tools/kernel')
			.allows('@maat-tools/contracts', /^node:/)
			.build();
		const findings = rule.evaluate(
			makeFacts([
				makeDep('@maat-tools/kernel', '@maat-tools/contracts'),
				makeDep('@maat-tools/kernel', 'node:path'),
				makeDep('@maat-tools/kernel', 'uuid'),
			]),
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ dependency: 'uuid' });
	});
});

// ─── PureLayerRule.evaluate() ─────────────────────────────────────────────────

describe('PureLayerRule.evaluate()', () => {
	test('flags all external deps from target', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/contracts')]));
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('maat-tools/coupling-rules/pure-imports@v1');
	});

	test('no finding for source package that does not match target', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/cli', 'uuid')]));
		expect(findings).toHaveLength(0);
	});

	test('finding message includes "Pure layer"', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).build();
		const findings = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', 'uuid')]));
		expect(findings[0]?.message).toContain('Pure');
	});

	test('internal dependency within target is not flagged', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).build();
		const findings = rule.evaluate(
			makeFacts([makeDep('@maat-tools/kernel', 'packages/kernel/src/internal.ts', { toExternal: false })]),
		);
		expect(findings).toHaveLength(0);
	});

	test('self-import via package name is not flagged', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).build();
		const findings = rule.evaluate(
			makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/kernel', { toExternal: true })]),
		);
		expect(findings).toHaveLength(0);
	});
});

// ─── describeArtifact ─────────────────────────────────────────────────────────

describe('LayerRule.describeArtifact()', () => {
	const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();

	test('dependsOn artifact → returns file and dependency', () => {
		const dep = makeDep('@maat-tools/kernel', 'uuid');
		const described = rule.describeArtifact({ kind: 'dependsOn', data: dep });
		expect(described.file).toBe(`${dep.from.path}:${dep.from.location.line}:${dep.from.location.column}`);
		expect(described.dependency).toBe('uuid');
	});

	test('dependsOn artifact without column → location omits column', () => {
		const dep = makeDep('@maat-tools/kernel', 'uuid');
		dep.from.location.column = undefined;
		const described = rule.describeArtifact({ kind: 'dependsOn', data: dep });
		expect(described.file).toBe(`${dep.from.path}:${dep.from.location.line}:undefined`);
	});

	test('unknown kind → returns stringified value', () => {
		const described = rule.describeArtifact({ kind: 'other', data: 'raw' });
		expect(described).toEqual({ value: 'raw' });
	});
});

// ─── builder behavior ─────────────────────────────────────────────────────────

describe('layer() builder', () => {
	test('build returns a rule', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		expect(isRule(rule)).toBe(true);
	});

	test('chained allows accumulate', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').allows('@maat-tools/core').build();
		const findings = rule.evaluate(
			makeFacts([
				makeDep('@maat-tools/kernel', '@maat-tools/contracts'),
				makeDep('@maat-tools/kernel', '@maat-tools/core'),
			]),
		);
		expect(findings).toHaveLength(0);
	});

	test('instanceId includes target', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		expect(rule.instanceId).toContain('@maat-tools/kernel');
	});
});
