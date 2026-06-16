import { describe, expect, test } from 'bun:test';
import type { Finding } from '@maat-tools/contracts';
import type { DependsOn } from '@maat-tools/vocabulary';
import { ErosionInsight } from './erosion';

function churnFinding(path: string, count: number): Finding {
	return {
		ruleId: 'maat-tools/git-rules/churn@v1',
		instanceId: 'maat-tools/git-rules/churn@v1',
		fingerprint: `churn-${path}`,
		message: `"${path}" changed ${count} times`,
		artifacts: [{ kind: 'git-churn', data: { path, count } }],
	};
}

function boundaryLeaf(boundary: string): string {
	const segments = boundary.split('/');

	return segments[segments.length - 1] ?? boundary;
}

function couplingFinding(
	boundary: string,
	variant: 'pure-imports' | 'layer-imports' = 'pure-imports',
	file = boundary.endsWith('/**')
		? `${boundary.slice(0, -3)}/index.ts`
		: `packages/${boundaryLeaf(boundary)}/src/index.ts`,
): Finding {
	const isGlobMode = boundary.endsWith('/**');
	const dep: DependsOn = {
		from: {
			path: file,
			package: isGlobMode ? undefined : { name: boundary, rootPath: `packages/${boundaryLeaf(boundary)}` },
			location: { file, line: 1 },
		},
		to: { path: 'node:crypto', isExternal: true },
	};

	return {
		ruleId: `maat-tools/coupling-rules/${variant}@v1`,
		instanceId: `maat-tools/coupling-rules/${variant}@v1:${boundary}`,
		fingerprint: `coupling-${boundary}`,
		message: `"${boundary}" has a layer violation`,
		artifacts: [{ kind: 'dependsOn', data: dep }],
	};
}

// ── analyze ───────────────────────────────────────────────────────────────────

describe('ErosionInsight.analyze()', () => {
	test('no findings → no results', () => {
		const insight = new ErosionInsight();
		expect(insight.analyze([])).toHaveLength(0);
	});

	test('churn only, no coupling violations → no results', () => {
		const insight = new ErosionInsight();
		const findings = [churnFinding('packages/cli/src/index.ts', 10)];
		expect(insight.analyze(findings)).toHaveLength(0);
	});

	test('coupling violations only, no churn → no results', () => {
		const insight = new ErosionInsight();
		const findings = [couplingFinding('@maat-tools/cli')];
		expect(insight.analyze(findings)).toHaveLength(0);
	});

	test('churn and violations in different boundaries → no results', () => {
		const insight = new ErosionInsight();
		const findings = [churnFinding('packages/cli/src/index.ts', 10), couplingFinding('@maat-tools/kernel')];
		expect(insight.analyze(findings)).toHaveLength(0);
	});

	test('churn and violations in the same boundary → one result', () => {
		const insight = new ErosionInsight();
		const findings = [churnFinding('packages/cli/src/index.ts', 10), couplingFinding('@maat-tools/cli')];
		const results = insight.analyze(findings);
		expect(results).toHaveLength(1);
		expect(results[0]?.insightId).toBe('maat-tools/erosion@v1');
		expect(results[0]?.message).toContain('hot architectural debt');
		expect(results[0]?.message).toContain('@maat-tools/cli');
		expect(results[0]?.message).toContain('1 boundary(s)');
		expect(results[0]?.message).toContain('1 boundary violation');
	});

	test('multiple churning files in same boundary sum their counts', () => {
		const insight = new ErosionInsight();
		const findings = [
			churnFinding('packages/cli/src/index.ts', 8),
			churnFinding('packages/cli/src/commands/check.ts', 5),
			couplingFinding('@maat-tools/cli'),
		];
		const [result] = insight.analyze(findings);
		expect(result?.message).toContain('13 changes');
	});

	test('named boundaries can match churn when violation artifacts come from transitive imports', () => {
		const insight = new ErosionInsight();
		const findings = [
			churnFinding('packages/kernel/src/index.ts', 8),
			couplingFinding('@maat-tools/kernel', 'pure-imports', 'packages/contracts/src/index.ts'),
		];
		const results = insight.analyze(findings);
		expect(results).toHaveLength(1);
		expect(results[0]?.message).toContain('@maat-tools/kernel');
	});

	test('multiple boundaries in intersection → sorted by total churn descending', () => {
		const insight = new ErosionInsight();
		const findings = [
			churnFinding('packages/kernel/src/index.ts', 3),
			churnFinding('packages/cli/src/index.ts', 12),
			couplingFinding('@maat-tools/cli'),
			couplingFinding('@maat-tools/kernel'),
		];
		const [result] = insight.analyze(findings);
		expect(result?.message).toContain('2 boundary(s)');
		const data = result?.data as Array<{ boundary: string; churnTotal: number }>;
		expect(data[0]?.boundary).toBe('@maat-tools/cli');
		expect(data[1]?.boundary).toBe('@maat-tools/kernel');
	});

	test('files outside boundary roots are ignored', () => {
		const insight = new ErosionInsight();
		const findings = [
			churnFinding('docs/config.ts', 20),
			churnFinding('maat.config.ts', 10),
			couplingFinding('@maat-tools/cli'),
		];
		expect(insight.analyze(findings)).toHaveLength(0);
	});

	test('path boundaries are matched without package conventions', () => {
		const insight = new ErosionInsight();
		const findings = [churnFinding('src/payments/handler.ts', 7), couplingFinding('src/payments/**')];
		const results = insight.analyze(findings);
		expect(results).toHaveLength(1);
		expect(results[0]?.message).toContain('src/payments/**');
	});

	test('result data contains file-level churn detail', () => {
		const insight = new ErosionInsight();
		const findings = [churnFinding('packages/cli/src/index.ts', 9), couplingFinding('@maat-tools/cli')];
		const [result] = insight.analyze(findings);
		const data = result?.data as Array<{
			boundary: string;
			churnTotal: number;
			files: Array<{ path: string; count: number }>;
		}>;
		expect(data[0]?.files).toEqual([{ path: 'packages/cli/src/index.ts', count: 9 }]);
	});

	test('result data contains boundary violation detail', () => {
		const insight = new ErosionInsight();
		const findings = [churnFinding('packages/cli/src/index.ts', 9), couplingFinding('@maat-tools/cli')];
		const [result] = insight.analyze(findings);
		const data = result?.data as Array<{
			violationCount: number;
			violations: Array<{ file?: string; dependency?: string }>;
		}>;
		expect(data[0]?.violationCount).toBe(1);
		expect(data[0]?.violations[0]?.file).toBe('packages/cli/src/index.ts');
		expect(data[0]?.violations[0]?.dependency).toBe('node:crypto');
	});

	test('layer-imports coupling variant is also matched', () => {
		const insight = new ErosionInsight();
		const findings = [
			churnFinding('packages/payments/src/index.ts', 8),
			couplingFinding('@acme/payments', 'layer-imports'),
		];
		const results = insight.analyze(findings);
		expect(results).toHaveLength(1);
		expect(results[0]?.message).toContain('@acme/payments');
	});

	test('coupling rule with non-matching pattern is ignored', () => {
		const insight = new ErosionInsight();
		const findings = [
			churnFinding('packages/cli/src/index.ts', 10),
			{
				ruleId: 'maat-tools/git-rules/churn@v1',
				instanceId: 'maat-tools/git-rules/churn@v1',
				fingerprint: 'other',
				message: 'some other rule',
				artifacts: [],
			},
		];
		expect(insight.analyze(findings)).toHaveLength(0);
	});

	test('churn artifacts with invalid path or count are ignored', () => {
		const insight = new ErosionInsight();
		const findings: Finding[] = [
			churnFinding('packages/cli/src/index.ts', 10),
			{
				ruleId: 'maat-tools/git-rules/churn@v1',
				instanceId: 'maat-tools/git-rules/churn@v1',
				fingerprint: 'invalid',
				message: 'invalid churn entry',
				artifacts: [
					{ kind: 'git-churn', data: { path: 123, count: 5 } },
					{ kind: 'git-churn', data: { path: 'packages/cli/src/other.ts', count: 'many' } },
					{ kind: 'git-churn', data: {} },
				],
			},
			couplingFinding('@maat-tools/cli'),
		];
		const [result] = insight.analyze(findings);
		const data = result?.data as Array<{ churnTotal: number; files: Array<{ path: string }> }>;
		expect(data[0]?.churnTotal).toBe(10);
		expect(data[0]?.files).toHaveLength(1);
	});

	test('multiple violations in the same boundary are grouped', () => {
		const insight = new ErosionInsight();
		const findings = [
			churnFinding('packages/cli/src/index.ts', 10),
			couplingFinding('@maat-tools/cli', 'pure-imports', 'packages/cli/src/index.ts'),
			couplingFinding('@maat-tools/cli', 'layer-imports', 'packages/cli/src/commands/check.ts'),
		];
		const [result] = insight.analyze(findings);
		const data = result?.data as Array<{ violationCount: number; violations: unknown[] }>;
		expect(data[0]?.violationCount).toBe(2);
		expect(data[0]?.violations).toHaveLength(2);
		expect(result?.message).toContain('2 boundary violations');
	});

	test('coupling finding without colon in instanceId is ignored', () => {
		const insight = new ErosionInsight();
		const findings: Finding[] = [
			churnFinding('packages/cli/src/index.ts', 10),
			{
				ruleId: 'maat-tools/coupling-rules/pure-imports@v1',
				instanceId: 'maat-tools/coupling-rules/pure-imports@v1',
				fingerprint: 'no-colon',
				message: 'missing target boundary',
				artifacts: [
					{ kind: 'dependsOn', data: { from: { path: 'packages/cli/src/index.ts' }, to: { path: 'node:crypto' } } },
				],
			},
		];
		expect(insight.analyze(findings)).toHaveLength(0);
	});

	test('other coupling rule variants are ignored', () => {
		const insight = new ErosionInsight();
		const findings: Finding[] = [
			churnFinding('packages/cli/src/index.ts', 10),
			{
				ruleId: 'maat-tools/coupling-rules/structural@v1',
				instanceId: 'maat-tools/coupling-rules/structural@v1:@maat-tools/cli',
				fingerprint: 'other-variant',
				message: 'other coupling variant',
				artifacts: [
					{
						kind: 'dependsOn',
						data: {
							from: { path: 'packages/cli/src/index.ts', package: { name: '@maat-tools/cli' } },
							to: { path: 'node:crypto' },
						},
					},
				],
			},
		];
		expect(insight.analyze(findings)).toHaveLength(0);
	});

	test('result message highlights hottest file and leaking dependency', () => {
		const insight = new ErosionInsight();
		const findings = [
			churnFinding('packages/cli/src/index.ts', 12),
			churnFinding('packages/cli/src/commands/check.ts', 5),
			couplingFinding('@maat-tools/cli'),
		];
		const [result] = insight.analyze(findings);
		expect(result?.message).toContain('hottest packages/cli/src/index.ts (12 changes)');
		expect(result?.message).toContain('leaking node:crypto');
	});

	test('violation without dependency path omits leaking text', () => {
		const insight = new ErosionInsight();
		const findings: Finding[] = [
			churnFinding('packages/cli/src/index.ts', 10),
			{
				ruleId: 'maat-tools/coupling-rules/pure-imports@v1',
				instanceId: 'maat-tools/coupling-rules/pure-imports@v1:packages/cli/**',
				fingerprint: 'no-dep',
				message: 'boundary violation',
				artifacts: [{ kind: 'dependsOn', data: { from: { path: 'packages/cli/src/index.ts' }, to: {} } }],
			},
		];
		const [result] = insight.analyze(findings);
		expect(result?.message).toBeDefined();
		expect(result?.message ?? '').not.toContain('leaking');
		const data = result?.data as Array<{ violations: Array<{ dependency?: string }> }>;
		expect(data[0]?.violations[0]?.dependency).toBeUndefined();
	});

	test('result message pluralizes hot files correctly', () => {
		const insight = new ErosionInsight();
		const singleFileFindings = [churnFinding('packages/cli/src/index.ts', 10), couplingFinding('@maat-tools/cli')];
		const [singleResult] = insight.analyze(singleFileFindings);
		expect(singleResult?.message).toContain('1 hot file');

		const multiFileFindings = [
			churnFinding('packages/cli/src/index.ts', 10),
			churnFinding('packages/cli/src/commands/check.ts', 5),
			couplingFinding('@maat-tools/cli'),
		];
		const [multiResult] = insight.analyze(multiFileFindings);
		expect(multiResult?.message).toContain('2 hot files');
	});

	test('exposes id and required rules', () => {
		const insight = new ErosionInsight();
		expect(insight.id).toBe('maat-tools/erosion@v1');
		expect(insight.needRules).toContain('maat-tools/git-rules/churn@v1');
		expect(insight.needRules).toContain('maat-tools/coupling-rules/pure-imports@v1');
		expect(insight.needRules).toContain('maat-tools/coupling-rules/layer-imports@v1');
	});
});
