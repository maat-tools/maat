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
});
