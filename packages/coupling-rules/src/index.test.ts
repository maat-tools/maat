import { describe, expect, test } from 'bun:test';
import { isRule, isRuleBuilder, RULE_BUILDER_BRAND } from '@maat-tools/contracts';
import type { Import } from '@maat-tools/vocabulary';
import { layer } from './layer';
import { Pure } from './roles';

function makeImport(overrides: Partial<Import> = {}): Import {
	return {
		file: '/repo/packages/kernel/src/index.ts',
		packageName: '@maat-tools/kernel',
		specifier: '@maat-tools/contracts',
		location: { file: '/repo/packages/kernel/src/index.ts', line: 1 },
		...overrides,
	};
}

describe('layer()', () => {
	test('initial builder is NOT a branded RuleBuilder (build() not yet available)', () => {
		const builder = layer('@maat-tools/kernel');
		expect(isRuleBuilder(builder)).toBe(false);
	});

	test('.is() returns a branded RuleBuilder', () => {
		const ready = layer('@maat-tools/kernel').is(Pure);
		expect(isRuleBuilder(ready)).toBe(true);
		expect(ready[RULE_BUILDER_BRAND]).toBe(true);
	});

	test('.allows() returns a branded RuleBuilder', () => {
		const ready = layer('@maat-tools/kernel').allows('@maat-tools/contracts');
		expect(isRuleBuilder(ready)).toBe(true);
		expect(ready[RULE_BUILDER_BRAND]).toBe(true);
	});

	test('.is() returns a new object (not the initial builder)', () => {
		const initial = layer('@maat-tools/kernel');
		const ready = initial.is(Pure);
		expect(ready).not.toBe(initial);
	});

	test('.allows() returns a new object each call but accumulates patterns', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').allows('@maat-tools/vocabulary').build();
		expect(isRule(rule)).toBe(true);
	});

	test('throws when target is empty', () => {
		expect(() => layer('')).toThrow('layer() requires a non-empty target');
	});

	test('.build() returns a valid Rule', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts').build();
		expect(isRule(rule)).toBe(true);
		expect(rule.id).toBe('coupling/pure-imports:@maat-tools/kernel@v1');
		expect(rule.needFacts).toContain('imports');
	});

	test('.build() without .is() returns a LayerRule', () => {
		const rule = layer('@maat-tools/kernel').allows('@maat-tools/contracts').build();
		expect(rule.id).toBe('coupling/layer-imports:@maat-tools/kernel@v1');
	});

	test('.build() with path target returns a PathLayerRule', () => {
		const rule = layer('./src/domain/**').allows('./src/shared/**').build();
		expect(rule.id).toBe('coupling/layer-imports:./src/domain/**@v1');
	});

	test('.build() with path target + Pure returns a Pure PathLayerRule', () => {
		const rule = layer('./src/domain/**').is(Pure).allows('./src/shared/**').build();
		expect(rule.id).toBe('coupling/pure-imports:./src/domain/**@v1');
	});
});

describe('LayerRule.evaluate() — allowlist', () => {
	test('no finding when specifier is in allows list', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts').build();
		const findings = rule.evaluate({
			imports: [makeImport({ specifier: '@maat-tools/contracts' })],
		});
		expect(findings).toHaveLength(0);
	});

	test('finding when specifier is NOT in allows list', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts').build();
		const findings = rule.evaluate({
			imports: [makeImport({ specifier: 'uuid' })],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleId).toBe('coupling/pure-imports:@maat-tools/kernel@v1');
	});

	test('no finding for relative imports regardless of allows list', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts').build();
		const findings = rule.evaluate({
			imports: [makeImport({ specifier: './utils' }), makeImport({ specifier: '../types' })],
		});
		expect(findings).toHaveLength(0);
	});

	test('cross-package relative imports must be normalized by the collector to package specifiers', () => {
		// The rule cannot detect cross-package relative imports on its own.
		// The collector is responsible for resolving relative paths that escape
		// a package boundary and re-recording them as package specifiers.
		// When it does, the allowlist check catches them normally.
		const rule = layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts').build();
		const findings = rule.evaluate({
			// collector normalized ../../contracts/src/index → @maat-tools/vocabulary (not allowed)
			imports: [makeImport({ specifier: '@maat-tools/vocabulary' })],
		});
		expect(findings).toHaveLength(1);
	});

	test('no finding when packageName does not match target', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts').build();
		const findings = rule.evaluate({
			imports: [makeImport({ packageName: '@maat-tools/cli', specifier: 'uuid' })],
		});
		expect(findings).toHaveLength(0);
	});

	test('allows() with empty list — any non-relative import is a finding', () => {
		const rule = layer('@maat-tools/contracts').is(Pure).allows().build();
		const findings = rule.evaluate({
			imports: [
				makeImport({
					packageName: '@maat-tools/contracts',
					specifier: 'node:crypto',
				}),
			],
		});
		expect(findings).toHaveLength(1);
	});

	test('string pattern matches sub-path', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts').build();
		const findings = rule.evaluate({
			imports: [makeImport({ specifier: '@maat-tools/contracts/types' })],
		});
		expect(findings).toHaveLength(0);
	});

	test('string pattern does not match partial package name', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts').build();
		const findings = rule.evaluate({
			imports: [makeImport({ specifier: '@maat-tools/contracts-extra' })],
		});
		expect(findings).toHaveLength(1);
	});

	test('regexp pattern in allows list', () => {
		const rule = layer('@maat-tools/kernel')
			.is(Pure)
			.allows(/^@maat-tools\//)
			.build();
		const findings = rule.evaluate({
			imports: [makeImport({ specifier: '@maat-tools/contracts' })],
		});
		expect(findings).toHaveLength(0);
	});

	test('regexp pattern — non-matching specifier is a finding', () => {
		const rule = layer('@maat-tools/kernel')
			.is(Pure)
			.allows(/^@maat-tools\//)
			.build();
		const findings = rule.evaluate({
			imports: [makeImport({ specifier: 'uuid' })],
		});
		expect(findings).toHaveLength(1);
	});

	test('includes role name in message', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts').build();
		const findings = rule.evaluate({
			imports: [makeImport({ specifier: 'uuid' })],
		});
		expect(findings[0]?.message).toContain('Pure');
	});

	test('multiple imports — only disallowed ones produce findings', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts', '@maat-tools/core').build();
		const findings = rule.evaluate({
			imports: [
				makeImport({ specifier: '@maat-tools/contracts' }),
				makeImport({ specifier: '@maat-tools/core' }),
				makeImport({ specifier: 'uuid' }),
				makeImport({ specifier: './utils' }),
			],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ specifier: 'uuid' });
	});
});

describe('roles', () => {
	test('Pure has name Pure', () => {
		expect(Pure.name).toBe('Pure');
	});
});

describe('PureLayerRule — external deps in allows()', () => {
	test('external explicitly in allows → no finding', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts', 'node:crypto').build();
		const findings = rule.evaluate({
			imports: [makeImport({ specifier: 'node:crypto' })],
		});
		expect(findings).toHaveLength(0);
	});

	test('external NOT in allows → finding', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts', 'node:path').build();
		const findings = rule.evaluate({
			imports: [makeImport({ specifier: 'node:crypto' })],
		});
		expect(findings).toHaveLength(1);
	});

	test('no externals in allows — any external import is a finding', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts').build();
		const findings = rule.evaluate({
			imports: [makeImport({ specifier: 'node:crypto' })],
		});
		expect(findings).toHaveLength(1);
	});

	test('regexp in allows matches external', () => {
		const rule = layer('@maat-tools/kernel')
			.is(Pure)
			.allows(/^node:/)
			.build();
		const findings = rule.evaluate({
			imports: [makeImport({ specifier: 'node:crypto' }), makeImport({ specifier: 'uuid' })],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ specifier: 'uuid' });
	});
});

describe('PureLayerRule — transitive check', () => {
	test('dep imports from outside budget — caught by default', () => {
		const rule = layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts').build();
		const findings = rule.evaluate({
			imports: [
				makeImport({ packageName: '@maat-tools/kernel', specifier: '@maat-tools/contracts' }),
				makeImport({ packageName: '@maat-tools/contracts', specifier: 'node:crypto' }),
			],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({
			target: '@maat-tools/kernel',
			via: '@maat-tools/contracts',
			specifier: 'node:crypto',
		});
		expect(findings[0]?.message).toContain('transitive dependency');
	});

	test('contracts own rule catches its own violation', () => {
		const rule = layer('@maat-tools/contracts').is(Pure).allows().build();
		const findings = rule.evaluate({
			imports: [makeImport({ packageName: '@maat-tools/contracts', specifier: 'node:crypto' })],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('@maat-tools/contracts');
	});

	test('transitive: false preserves direct-only behavior', () => {
		const rule = layer('@maat-tools/kernel').is(Pure, { transitive: false }).allows('@maat-tools/contracts').build();
		const findings = rule.evaluate({
			imports: [
				makeImport({ packageName: '@maat-tools/kernel', specifier: '@maat-tools/contracts' }),
				makeImport({ packageName: '@maat-tools/contracts', specifier: 'node:crypto' }),
			],
		});
		expect(findings).toHaveLength(0);
	});
});

describe('LayerRule.describeArtifact()', () => {
	const rule = layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts').build();

	test('import artifact → returns file and specifier', () => {
		const imp = makeImport({ file: '/src/index.ts', specifier: 'uuid' });
		const described = rule.describeArtifact({ kind: 'import', data: imp });
		expect(described).toEqual({ file: '/src/index.ts', specifier: 'uuid' });
	});

	test('unknown kind → returns stringified value', () => {
		const described = rule.describeArtifact({ kind: 'other', data: 'raw' });
		expect(described).toEqual({ value: 'raw' });
	});
});

// ─── Path Mode ────────────────────────────────────────────────────────────────
//
// When target starts with './', the rule matches imp.file against the glob
// and resolves ../ specifiers before checking the allowed list.

function makePathImport(overrides: Partial<Import> = {}): Import {
	return {
		file: 'src/domain/user/service.ts',
		packageName: null,
		specifier: '../auth',
		location: { file: 'src/domain/user/service.ts', line: 1 },
		...overrides,
	};
}

describe('PathLayerRule — file target matching', () => {
	test('file outside target glob → ignored even with disallowed specifier', () => {
		const rule = layer('./src/domain/**').allows('./src/shared/**').build();
		const findings = rule.evaluate({
			imports: [makePathImport({ file: 'src/infrastructure/db.ts', specifier: 'node:fs' })],
		});
		expect(findings).toHaveLength(0);
	});

	test('** glob matches deeply nested file', () => {
		const rule = layer('./src/domain/**').allows('./src/shared/**').build();
		const findings = rule.evaluate({
			imports: [
				makePathImport({
					file: 'src/domain/deeply/nested/feature/service.ts',
					specifier: 'uuid',
				}),
			],
		});
		expect(findings).toHaveLength(1);
	});

	test('* glob matches only single path segment', () => {
		const rule = layer('./src/domain/*').allows('./src/shared/**').build();
		// This file is two levels deep — should NOT match './src/domain/*'
		const findings = rule.evaluate({
			imports: [makePathImport({ file: 'src/domain/user/service.ts', specifier: 'uuid' })],
		});
		expect(findings).toHaveLength(0);
	});

	test('* glob matches direct child', () => {
		const rule = layer('./src/domain/*').allows('./src/shared/**').build();
		const findings = rule.evaluate({
			imports: [makePathImport({ file: 'src/domain/service.ts', specifier: 'uuid' })],
		});
		expect(findings).toHaveLength(1);
	});
});

describe('PathLayerRule — relative specifier resolution', () => {
	test('./  imports are always allowed (same-directory)', () => {
		const rule = layer('./src/domain/**').allows().build();
		const findings = rule.evaluate({
			imports: [makePathImport({ file: 'src/domain/user/service.ts', specifier: './utils' })],
		});
		expect(findings).toHaveLength(0);
	});

	test('../ import that stays within the target layer → no finding', () => {
		// src/domain/user/service.ts + ../auth → src/domain/auth (still in ./src/domain/**)
		const rule = layer('./src/domain/**').allows('./src/domain/**').build();
		const findings = rule.evaluate({
			imports: [makePathImport({ file: 'src/domain/user/service.ts', specifier: '../auth' })],
		});
		expect(findings).toHaveLength(0);
	});

	test('../ import resolved to an allowed path glob → no finding', () => {
		// src/domain/user/service.ts dirname=src/domain/user → ../../shared/helpers → src/shared/helpers
		const rule = layer('./src/domain/**').allows('./src/shared/**').build();
		const findings = rule.evaluate({
			imports: [
				makePathImport({
					file: 'src/domain/user/service.ts',
					specifier: '../../shared/helpers',
				}),
			],
		});
		expect(findings).toHaveLength(0);
	});

	test('../ import resolved to a disallowed path → finding', () => {
		// src/domain/user/service.ts + ../../../infrastructure/db → src/infrastructure/db (not in allows)
		const rule = layer('./src/domain/**').allows('./src/shared/**').build();
		const findings = rule.evaluate({
			imports: [
				makePathImport({
					file: 'src/domain/user/service.ts',
					specifier: '../../../infrastructure/db',
				}),
			],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ specifier: '../../../infrastructure/db' });
	});

	test('files at different nesting depths importing same destination resolve identically', () => {
		// All three resolve to src/shared/helpers regardless of how many ../ are needed
		// src/domain/service.ts        → dirname=src/domain        → ../shared/helpers  → src/shared/helpers
		// src/domain/user/service.ts   → dirname=src/domain/user   → ../../shared/helpers → src/shared/helpers
		// src/domain/user/auth/service.ts → dirname=src/domain/user/auth → ../../../shared/helpers → src/shared/helpers
		const rule = layer('./src/domain/**').allows('./src/shared/**').build();
		const findings = rule.evaluate({
			imports: [
				makePathImport({
					file: 'src/domain/service.ts',
					specifier: '../shared/helpers',
				}),
				makePathImport({
					file: 'src/domain/user/service.ts',
					specifier: '../../shared/helpers',
				}),
				makePathImport({
					file: 'src/domain/user/auth/service.ts',
					specifier: '../../../shared/helpers',
				}),
			],
		});
		expect(findings).toHaveLength(0);
	});

	test('finding message includes the file and original specifier', () => {
		const rule = layer('./src/domain/**').allows('./src/shared/**').build();
		const findings = rule.evaluate({
			imports: [
				makePathImport({
					file: 'src/domain/user/service.ts',
					specifier: '../../../infrastructure/db',
				}),
			],
		});
		expect(findings[0]?.message).toContain('src/domain/user/service.ts');
		expect(findings[0]?.message).toContain('../../../infrastructure/db');
	});
});

describe('PathLayerRule — package specifiers in path mode', () => {
	test('package specifier in allows → no finding', () => {
		const rule = layer('./src/domain/**').allows('./src/shared/**', 'react').build();
		const findings = rule.evaluate({
			imports: [makePathImport({ file: 'src/domain/feature.ts', specifier: 'react' })],
		});
		expect(findings).toHaveLength(0);
	});

	test('package specifier not in allows → finding', () => {
		const rule = layer('./src/domain/**').allows('./src/shared/**').build();
		const findings = rule.evaluate({
			imports: [makePathImport({ file: 'src/domain/feature.ts', specifier: 'lodash' })],
		});
		expect(findings).toHaveLength(1);
	});

	test('regexp in allows matches package specifier', () => {
		const rule = layer('./src/domain/**')
			.allows(/^@company\//)
			.build();
		const findings = rule.evaluate({
			imports: [
				makePathImport({ file: 'src/domain/feature.ts', specifier: '@company/ui' }),
				makePathImport({ file: 'src/domain/feature.ts', specifier: 'lodash' }),
			],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.ruleIdentifier).toMatchObject({ specifier: 'lodash' });
	});
});

describe('PathLayerRule — Pure role', () => {
	test('Pure path mode has correct id prefix', () => {
		const rule = layer('./src/domain/**').is(Pure).allows('./src/shared/**').build();
		expect(rule.id).toBe('coupling/pure-imports:./src/domain/**@v1');
	});

	test('Pure path mode: finding message includes role name', () => {
		const rule = layer('./src/domain/**').is(Pure).allows('./src/shared/**').build();
		const findings = rule.evaluate({
			imports: [
				makePathImport({
					file: 'src/domain/service.ts',
					specifier: '../../../infrastructure/db',
				}),
			],
		});
		expect(findings[0]?.message).toContain('Pure');
	});

	test('Pure path mode: allowed imports produce no findings', () => {
		const rule = layer('./src/domain/**').is(Pure).allows('./src/shared/**', 'react').build();
		const findings = rule.evaluate({
			imports: [
				// src/domain/service.ts → dirname=src/domain → ../shared/utils → src/shared/utils
				makePathImport({ file: 'src/domain/service.ts', specifier: '../shared/utils' }),
				makePathImport({ file: 'src/domain/service.ts', specifier: 'react' }),
				makePathImport({ file: 'src/domain/service.ts', specifier: './local' }),
			],
		});
		expect(findings).toHaveLength(0);
	});
});

describe('PathLayerRule — mixed imports', () => {
	test('only files in target layer are policed', () => {
		const rule = layer('./src/domain/**').allows('./src/shared/**').build();
		const findings = rule.evaluate({
			imports: [
				// in target → should be checked
				makePathImport({ file: 'src/domain/service.ts', specifier: 'uuid' }),
				// outside target → ignored
				makePathImport({ file: 'src/infrastructure/db.ts', specifier: 'uuid' }),
				makePathImport({ file: 'src/shared/utils.ts', specifier: 'uuid' }),
			],
		});
		// Only the domain file produces a finding
		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain('src/domain/service.ts');
	});

	test('multiple violations in the same layer all produce findings', () => {
		const rule = layer('./src/domain/**').allows('./src/shared/**').build();
		const findings = rule.evaluate({
			imports: [
				makePathImport({
					file: 'src/domain/a.ts',
					specifier: '../../../infrastructure/repo.ts',
				}),
				makePathImport({ file: 'src/domain/b.ts', specifier: 'node:fs' }),
				makePathImport({ file: 'src/domain/c.ts', specifier: '../shared/helpers' }), // ok — src/domain + ../shared/helpers → src/shared/helpers
			],
		});
		expect(findings).toHaveLength(2);
	});
});
