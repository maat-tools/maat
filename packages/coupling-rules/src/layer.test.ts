import { describe, expect, spyOn, test } from 'bun:test';
import { isRule } from '@maat-tools/contracts';
import type { DependsOn } from '@maat-tools/vocabulary';
import { layer } from './layer';
import { Pure } from './roles';

spyOn(console, 'warn').mockImplementation(() => {});

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
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/contracts')]));
		expect(findings).toHaveLength(0);
	});

	test('finding when dependency is NOT in allows list', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', 'uuid')]));
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('maat-tools/coupling-rules/layer-imports@v1');
	});

	test('no finding when source package does not match target', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/cli', 'uuid')]));
		expect(findings).toHaveLength(0);
	});

	test('string pattern does not match partial package name', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/contracts-extra')]));
		expect(findings).toHaveLength(1);
	});

	test('package name allows subpath import without requiring /**', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/contracts/types')]));
		expect(findings).toHaveLength(0);
	});

	test('unscoped package name allows subpath import (e.g. uuid/v4 via string)', () => {
		const rule = layer('@maat-tools/kernel').allows('uuid').build();
		const { findings } = rule.evaluate(
			makeFacts([
				makeDep('@maat-tools/kernel', 'uuid'),
				makeDep('@maat-tools/kernel', 'uuid/v4'),
				makeDep('@maat-tools/kernel', 'uuid/v5'),
				makeDep('@maat-tools/kernel', 'uuid-base62'), // partial name — must still flag
			]),
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ dependency: 'uuid-base62' });
	});

	test('package name allows exact import and all subpath imports', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		const { findings } = rule.evaluate(
			makeFacts([
				makeDep('@maat-tools/kernel', '@maat-tools/contracts'),
				makeDep('@maat-tools/kernel', '@maat-tools/contracts/types'),
				makeDep('@maat-tools/kernel', '@maat-tools/contracts/deep/nested'),
				makeDep('@maat-tools/kernel', 'uuid'), // not in allows — must flag
			]),
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ dependency: 'uuid' });
	});

	test('regexp pattern in allows list', () => {
		const rule = layer('@maat-tools/kernel')
			.allows(/^@maat-tools\//)
			.build();
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/contracts')]));
		expect(findings).toHaveLength(0);
	});

	test('regexp pattern — non-matching dependency is a finding', () => {
		const rule = layer('@maat-tools/kernel')
			.allows(/^@maat-tools\//)
			.build();
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', 'uuid')]));
		expect(findings).toHaveLength(1);
	});

	test('multiple deps — only disallowed ones produce findings', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts', '@maat-tools/core').build();
		const { findings } = rule.evaluate(
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
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', 'uuid')]));
		expect(findings[0]?.message).toContain('@maat-tools/kernel');
		expect(findings[0]?.message).toContain('uuid');
	});

	test('internal dependency within target is not flagged', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		const { findings } = rule.evaluate(
			makeFacts([makeDep('@maat-tools/kernel', 'packages/kernel/src/internal.ts', { toExternal: false })]),
		);
		expect(findings).toHaveLength(0);
	});

	test('self-import via package name is not flagged', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		const { findings } = rule.evaluate(
			makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/kernel', { toExternal: true })]),
		);
		expect(findings).toHaveLength(0);
	});

	test('glob target matches files outside named package', () => {
		const rule = layer('packages/kernel/**').allows('@maat-tools/contracts').build();
		const { findings } = rule.evaluate(
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
		expect(rule.evaluate(makeFacts([])).findings).toHaveLength(0);
	});

	test('mixed string and regexp allows', () => {
		const rule = layer('@maat-tools/kernel')
			.allows('@maat-tools/contracts', /^node:/)
			.build();
		const { findings } = rule.evaluate(
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

// ─── LayerRule.evaluate() — denylist (forbids) ────────────────────────────────

describe('LayerRule.evaluate() — denylist', () => {
	test('no finding when dependency is NOT in forbids list', () => {
		const rule = layer('@maat-tools/kernel').forbids('uuid').build();
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/contracts')]));
		expect(findings).toHaveLength(0);
	});

	test('finding when dependency IS in forbids list', () => {
		const rule = layer('@maat-tools/kernel').forbids('uuid').build();
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', 'uuid')]));
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('maat-tools/coupling-rules/layer-imports@v1');
	});

	test('no finding when source package does not match target', () => {
		const rule = layer('@maat-tools/kernel').forbids('uuid').build();
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/cli', 'uuid')]));
		expect(findings).toHaveLength(0);
	});

	test('finding message indicates forbidden import', () => {
		const rule = layer('@maat-tools/kernel').forbids('uuid').build();
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', 'uuid')]));
		expect(findings[0]?.message).toContain('@maat-tools/kernel');
		expect(findings[0]?.message).toContain('uuid');
		expect(findings[0]?.message).toContain('forbidden');
	});

	test('multiple deps — only forbidden ones produce findings', () => {
		const rule = layer('@maat-tools/kernel').forbids('uuid', 'lodash').build();
		const { findings } = rule.evaluate(
			makeFacts([
				makeDep('@maat-tools/kernel', '@maat-tools/contracts'),
				makeDep('@maat-tools/kernel', 'uuid'),
				makeDep('@maat-tools/kernel', 'lodash'),
				makeDep('@maat-tools/cli', 'uuid'),
			]),
		);
		expect(findings).toHaveLength(2);
		expect(findings.map((f) => f.ruleIdentifier)).toMatchObject([{ dependency: 'uuid' }, { dependency: 'lodash' }]);
	});

	test('regexp pattern in forbids list', () => {
		const rule = layer('@maat-tools/kernel')
			.forbids(/^lodash/)
			.build();
		const { findings } = rule.evaluate(
			makeFacts([
				makeDep('@maat-tools/kernel', 'lodash'),
				makeDep('@maat-tools/kernel', 'lodash/fp'),
				makeDep('@maat-tools/kernel', 'uuid'),
			]),
		);
		expect(findings).toHaveLength(2);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ dependency: 'lodash' });
		expect(findings[1]?.ruleIdentifier).toMatchObject({ dependency: 'lodash/fp' });
	});

	test('regexp pattern — non-matching dependency is not a finding', () => {
		const rule = layer('@maat-tools/kernel')
			.forbids(/^lodash/)
			.build();
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', 'uuid')]));
		expect(findings).toHaveLength(0);
	});

	test('mixed string and regexp forbids', () => {
		const rule = layer('@maat-tools/kernel')
			.forbids('uuid', /^lodash/)
			.build();
		const { findings } = rule.evaluate(
			makeFacts([
				makeDep('@maat-tools/kernel', 'uuid'),
				makeDep('@maat-tools/kernel', 'lodash/fp'),
				makeDep('@maat-tools/kernel', '@maat-tools/contracts'),
			]),
		);
		expect(findings).toHaveLength(2);
	});

	test('chained forbids() accumulate patterns', () => {
		const rule = layer('@maat-tools/kernel').forbids('uuid').forbids('lodash').build();
		const { findings } = rule.evaluate(
			makeFacts([makeDep('@maat-tools/kernel', 'uuid'), makeDep('@maat-tools/kernel', 'lodash')]),
		);
		expect(findings).toHaveLength(2);
	});

	test('string pattern does not match partial package name', () => {
		const rule = layer('@maat-tools/kernel').forbids('lodash').build();
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', 'lodash-es')]));
		expect(findings).toHaveLength(0);
	});

	test('package name forbids subpath import without requiring /**', () => {
		const rule = layer('@maat-tools/kernel').forbids('@maat-tools/utils').build();
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/utils/src/helpers')]));
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ dependency: '@maat-tools/utils/src/helpers' });
	});

	test('unscoped package name forbids subpath import (e.g. lodash/fp via string, not regexp)', () => {
		const rule = layer('@maat-tools/kernel').forbids('lodash').build();
		const { findings } = rule.evaluate(
			makeFacts([
				makeDep('@maat-tools/kernel', 'lodash'),
				makeDep('@maat-tools/kernel', 'lodash/fp'),
				makeDep('@maat-tools/kernel', 'lodash/collection/map'),
				makeDep('@maat-tools/kernel', 'lodash-es'), // partial name — must NOT match
			]),
		);
		expect(findings).toHaveLength(3);
		expect(findings.map((f) => f.ruleIdentifier)).toMatchObject([
			{ dependency: 'lodash' },
			{ dependency: 'lodash/fp' },
			{ dependency: 'lodash/collection/map' },
		]);
	});

	test('package name forbids exact import and all subpath imports', () => {
		const rule = layer('@maat-tools/kernel').forbids('@maat-tools/utils').build();
		const { findings } = rule.evaluate(
			makeFacts([
				makeDep('@maat-tools/kernel', '@maat-tools/utils'),
				makeDep('@maat-tools/kernel', '@maat-tools/utils/foo'),
				makeDep('@maat-tools/kernel', '@maat-tools/utils/deep/nested'),
				makeDep('@maat-tools/kernel', '@maat-tools/utils-extra'), // partial name — must NOT match
			]),
		);
		expect(findings).toHaveLength(3);
		expect(findings.map((f) => f.ruleIdentifier)).toMatchObject([
			{ dependency: '@maat-tools/utils' },
			{ dependency: '@maat-tools/utils/foo' },
			{ dependency: '@maat-tools/utils/deep/nested' },
		]);
	});

	test('internal dependency within target is not flagged even if it matches forbids', () => {
		const rule = layer('@maat-tools/kernel').forbids('packages/kernel/src/internal.ts').build();
		const { findings } = rule.evaluate(
			makeFacts([makeDep('@maat-tools/kernel', 'packages/kernel/src/internal.ts', { toExternal: false })]),
		);
		expect(findings).toHaveLength(0);
	});

	test('self-import via package name is not flagged even if it matches forbids', () => {
		const rule = layer('@maat-tools/kernel').forbids('@maat-tools/kernel').build();
		const { findings } = rule.evaluate(
			makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/kernel', { toExternal: true })]),
		);
		expect(findings).toHaveLength(0);
	});

	test('glob pattern in forbids list', () => {
		const rule = layer('src/domain/**').forbids('src/infrastructure/**').build();
		const { findings } = rule.evaluate(
			makeFacts([
				makeDep('@irrelevant', 'src/infrastructure/db.ts', {
					fromPath: 'src/domain/service.ts',
					toExternal: false,
				}),
				makeDep('@irrelevant', 'src/shared/utils.ts', {
					fromPath: 'src/domain/service.ts',
					toExternal: false,
				}),
			]),
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ dependency: 'src/infrastructure/db.ts' });
	});

	test('empty dependsOn → no findings', () => {
		const rule = layer('@maat-tools/kernel').forbids('uuid').build();
		expect(rule.evaluate(makeFacts([])).findings).toHaveLength(0);
	});

	test('ruleIdentifier includes target and dependency', () => {
		const rule = layer('@maat-tools/kernel').forbids('uuid').build();
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', 'uuid')]));
		expect(findings[0]?.ruleIdentifier).toMatchObject({
			target: '@maat-tools/kernel',
			dependency: 'uuid',
		});
	});

	test('forbids() returns a builder with instanceId including target', () => {
		const rule = layer('@maat-tools/kernel').forbids('uuid').build();
		expect(rule.instanceId).toContain('@maat-tools/kernel');
	});
});

describe('LayerRule.evaluate() — allowlist transitive', () => {
	test('transitive: no finding when allowed dep does not pull in disallowed external', () => {
		const rule = layer('src/payments/**').allows('src/core/**', 'node:crypto').build({ transitive: true });
		const { findings } = rule.evaluate(
			makeFacts([
				makeDep('@irrelevant', 'src/core/utils.ts', { fromPath: 'src/payments/checkout.ts', toExternal: false }),
				makeDep('@irrelevant', 'node:crypto', { fromPath: 'src/core/utils.ts', toExternal: true }),
			]),
		);
		expect(findings).toHaveLength(0);
	});

	test('transitive: finding when allowed dep pulls in disallowed external', () => {
		const rule = layer('src/payments/**').allows('src/core/**').build({ transitive: true });
		const { findings } = rule.evaluate(
			makeFacts([
				makeDep('@irrelevant', 'src/core/utils.ts', { fromPath: 'src/payments/checkout.ts', toExternal: false }),
				makeDep('@irrelevant', 'pg', { fromPath: 'src/core/utils.ts', toExternal: true }),
			]),
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ dependency: 'pg' });
		expect(findings[0]?.message).toContain('Transitive');
		expect(findings[0]?.message).toContain('not declared in allowed');
	});

	test('transitive: finding carries the intermediate path', () => {
		const rule = layer('src/payments/**').allows('src/core/**').build({ transitive: true });
		const { findings } = rule.evaluate(
			makeFacts([
				makeDep('@irrelevant', 'src/core/utils.ts', { fromPath: 'src/payments/checkout.ts', toExternal: false }),
				makeDep('@irrelevant', 'pg', { fromPath: 'src/core/utils.ts', toExternal: true }),
			]),
		);
		expect(findings[0]?.ruleIdentifier).toMatchObject({
			target: 'src/payments/**',
			currentPath: 'src/core/utils.ts',
			dependency: 'pg',
		});
	});

	test('transitive: direct disallowed dep is flagged once (main flow), not again transitively', () => {
		const rule = layer('src/payments/**').allows('src/core/**').build({ transitive: true });
		const { findings } = rule.evaluate(
			makeFacts([makeDep('@irrelevant', 'pg', { fromPath: 'src/payments/checkout.ts', toExternal: true })]),
		);
		expect(findings).toHaveLength(1);
	});

	test('transitive: deduplication — same violation from same intermediate seen twice emits one finding', () => {
		const rule = layer('src/payments/**').allows('src/core/**').build({ transitive: true });
		const { findings } = rule.evaluate(
			makeFacts([
				makeDep('@irrelevant', 'src/core/utils.ts', { fromPath: 'src/payments/checkout.ts', toExternal: false }),
				// two files under core both import pg — seenFindings deduplicates by (currentPath, dependency)
				makeDep('@irrelevant', 'pg', { fromPath: 'src/core/utils.ts', toExternal: true }),
				makeDep('@irrelevant', 'pg', { fromPath: 'src/core/utils.ts', toExternal: true }),
			]),
		);
		expect(findings).toHaveLength(1);
	});
});

describe('LayerRule.evaluate() — denylist transitive', () => {
	test('transitive: no finding when forbidden dep is not transitively reached', () => {
		const rule = layer('src/payments/**').forbids('src/banned/**').build({ transitive: true });
		const { findings } = rule.evaluate(
			makeFacts([
				makeDep('@irrelevant', 'src/core/utils.ts', { fromPath: 'src/payments/checkout.ts', toExternal: false }),
				makeDep('@irrelevant', 'src/shared/helpers.ts', { fromPath: 'src/core/utils.ts', toExternal: false }),
			]),
		);
		expect(findings).toHaveLength(0);
	});

	test('transitive: finding when internal forbidden dep is transitively reached', () => {
		const rule = layer('src/payments/**').forbids('src/banned/**').build({ transitive: true });
		const { findings } = rule.evaluate(
			makeFacts([
				makeDep('@irrelevant', 'src/core/utils.ts', { fromPath: 'src/payments/checkout.ts', toExternal: false }),
				makeDep('@irrelevant', 'src/banned/secret.ts', { fromPath: 'src/core/utils.ts', toExternal: false }),
			]),
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('forbidden');
		expect(findings[0]?.message).toContain('Transitive');
	});

	test('transitive: finding when external forbidden dep is transitively reached', () => {
		const rule = layer('src/payments/**').forbids('uuid').build({ transitive: true });
		const { findings } = rule.evaluate(
			makeFacts([
				makeDep('@irrelevant', 'src/core/utils.ts', { fromPath: 'src/payments/checkout.ts', toExternal: false }),
				makeDep('@irrelevant', 'uuid', { fromPath: 'src/core/utils.ts', toExternal: true }),
			]),
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ dependency: 'uuid' });
	});

	test('transitive: direct forbidden dep is reported in the main flow, not duplicated', () => {
		const rule = layer('src/payments/**').forbids('src/banned/**').build({ transitive: true });
		const { findings } = rule.evaluate(
			makeFacts([
				makeDep('@irrelevant', 'src/banned/secret.ts', { fromPath: 'src/payments/checkout.ts', toExternal: false }),
			]),
		);
		expect(findings).toHaveLength(1);
	});

	test('transitive: finding carries intermediate path in ruleIdentifier', () => {
		const rule = layer('src/payments/**').forbids('src/banned/**').build({ transitive: true });
		const { findings } = rule.evaluate(
			makeFacts([
				makeDep('@irrelevant', 'src/core/utils.ts', { fromPath: 'src/payments/checkout.ts', toExternal: false }),
				makeDep('@irrelevant', 'src/banned/secret.ts', { fromPath: 'src/core/utils.ts', toExternal: false }),
			]),
		);
		expect(findings[0]?.ruleIdentifier).toMatchObject({
			target: 'src/payments/**',
			currentPath: 'src/core/utils.ts',
			dependency: 'src/banned/secret.ts',
		});
	});
});

// ─── PureLayerRule.evaluate() ─────────────────────────────────────────────────

describe('PureLayerRule.evaluate()', () => {
	test('flags all external deps from target', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).build();
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/contracts')]));
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('maat-tools/coupling-rules/pure-imports@v1');
	});

	test('no finding for source package that does not match target', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).build();
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/cli', 'uuid')]));
		expect(findings).toHaveLength(0);
	});

	test('finding message includes "Pure layer"', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).build();
		const { findings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', 'uuid')]));
		expect(findings[0]?.message).toContain('Pure');
	});

	test('internal dependency within target is not flagged', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).build();
		const { findings } = rule.evaluate(
			makeFacts([makeDep('@maat-tools/kernel', 'packages/kernel/src/internal.ts', { toExternal: false })]),
		);
		expect(findings).toHaveLength(0);
	});

	test('self-import via package name is not flagged', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).build();
		const { findings } = rule.evaluate(
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
		const { findings } = rule.evaluate(
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

describe('LayerRule.evaluate() — pattern sanity warnings', () => {
	test('warns when a forbids pattern matches nothing anywhere in the graph (typo)', () => {
		const rule = layer('@maat-tools/kernel').forbids('@maat-tools/clii').build();
		const { warnings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/contracts')]));
		expect(warnings).toHaveLength(1);
		expect(warnings?.[0]).toContain('@maat-tools/clii');
		expect(warnings?.[0]).toContain('typo or wrong glob');
	});

	test('does NOT warn for a forbids pattern the target never violates but exists elsewhere', () => {
		// kernel does not import cli (no violation), but cli IS imported elsewhere in the graph.
		const rule = layer('@maat-tools/kernel').forbids('@maat-tools/cli').build();
		const { findings, warnings } = rule.evaluate(
			makeFacts([
				makeDep('@maat-tools/kernel', '@maat-tools/contracts'),
				makeDep('@maat-tools/web', '@maat-tools/cli'),
			]),
		);
		expect(findings).toHaveLength(0);
		expect(warnings ?? []).toHaveLength(0);
	});

	test('does NOT warn for a forbids pattern that is actually violated', () => {
		const rule = layer('@maat-tools/kernel').forbids('@maat-tools/cli').build();
		const { findings, warnings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/cli')]));
		expect(findings).toHaveLength(1);
		expect(warnings ?? []).toHaveLength(0);
	});

	test('matches subpath imports so a bare package name does not warn', () => {
		const rule = layer('@maat-tools/kernel').forbids('@maat-tools/cli').build();
		const { findings, warnings } = rule.evaluate(
			makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/cli/dist/commands/check')]),
		);
		expect(findings).toHaveLength(1);
		expect(warnings ?? []).toHaveLength(0);
	});

	test('warns for an allows pattern that matches nothing anywhere (typo)', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contractz').build();
		const { warnings } = rule.evaluate(makeFacts([makeDep('@maat-tools/kernel', '@maat-tools/contracts')]));
		expect(warnings).toHaveLength(1);
		expect(warnings?.[0]).toContain('@maat-tools/contractz');
	});

	test('no warnings on an empty dependency graph', () => {
		const rule = layer('@maat-tools/kernel').forbids('@maat-tools/cli').build();
		const { warnings } = rule.evaluate(makeFacts([]));
		expect(warnings ?? []).toHaveLength(0);
	});
});
