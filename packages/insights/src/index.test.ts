import { describe, expect, test } from 'bun:test';
import type { Finding } from '@maat-tools/contracts';
import { ErosionInsight } from './erosion';

function churnFinding(path: string, count: number): Finding {
	return {
		ruleId: 'git/churn@v1',
		fingerprint: `churn-${path}`,
		message: `"${path}" changed ${count} times`,
		artifacts: [{ kind: 'git-churn', data: { path, count } }],
	};
}

function couplingFinding(targetPackage: string, variant: 'pure-imports' | 'layer-imports' = 'pure-imports'): Finding {
	return {
		ruleId: `coupling/${variant}:${targetPackage}@v1`,
		fingerprint: `coupling-${targetPackage}`,
		message: `"${targetPackage}" has a layer violation`,
		artifacts: [{ kind: 'import', data: { file: 'packages/contracts/dist/index.js', specifier: 'node:crypto' } }],
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

	test('churn and violations in different packages → no results', () => {
		const insight = new ErosionInsight();
		const findings = [churnFinding('packages/cli/src/index.ts', 10), couplingFinding('@maat-tools/kernel')];
		expect(insight.analyze(findings)).toHaveLength(0);
	});

	test('churn and violations in the same package → one result', () => {
		const insight = new ErosionInsight({ packagePrefix: '@maat-tools/' });
		const findings = [churnFinding('packages/cli/src/index.ts', 10), couplingFinding('@maat-tools/cli')];
		const results = insight.analyze(findings);
		expect(results).toHaveLength(1);
		expect(results[0]?.insightId).toBe('erosion@v1');
		expect(results[0]?.message).toContain('hot architectural debt');
		expect(results[0]?.message).toContain('@maat-tools/cli');
		expect(results[0]?.message).toContain('1 package(s)');
		expect(results[0]?.message).toContain('1 boundary violation');
	});

	test('multiple churning files in same package sum their counts', () => {
		const insight = new ErosionInsight({ packagePrefix: '@maat-tools/' });
		const findings = [
			churnFinding('packages/cli/src/index.ts', 8),
			churnFinding('packages/cli/src/commands/check.ts', 5),
			couplingFinding('@maat-tools/cli'),
		];
		const [result] = insight.analyze(findings);
		expect(result?.message).toContain('13 changes');
	});

	test('multiple packages in intersection → sorted by total churn descending', () => {
		const insight = new ErosionInsight({ packagePrefix: '@maat-tools/' });
		const findings = [
			churnFinding('packages/kernel/src/index.ts', 3),
			churnFinding('packages/cli/src/index.ts', 12),
			couplingFinding('@maat-tools/cli'),
			couplingFinding('@maat-tools/kernel'),
		];
		const [result] = insight.analyze(findings);
		expect(result?.message).toContain('2 package(s)');
		const data = result?.data as Array<{ package: string; churnTotal: number }>;
		expect(data[0]?.package).toBe('@maat-tools/cli');
		expect(data[1]?.package).toBe('@maat-tools/kernel');
	});

	test('files outside packageDir are ignored', () => {
		const insight = new ErosionInsight({ packagePrefix: '@maat-tools/' });
		const findings = [
			churnFinding('docs/config.ts', 20),
			churnFinding('maat.config.ts', 10),
			couplingFinding('@maat-tools/cli'),
		];
		expect(insight.analyze(findings)).toHaveLength(0);
	});

	test('custom packageDir is respected', () => {
		const insight = new ErosionInsight({ packageDir: 'src/', packagePrefix: 'com.acme/' });
		const findings = [churnFinding('src/payments/handler.ts', 7), couplingFinding('com.acme/payments')];
		const results = insight.analyze(findings);
		expect(results).toHaveLength(1);
		expect(results[0]?.message).toContain('com.acme/payments');
	});

	test('result data contains file-level churn detail', () => {
		const insight = new ErosionInsight({ packagePrefix: '@maat-tools/' });
		const findings = [churnFinding('packages/cli/src/index.ts', 9), couplingFinding('@maat-tools/cli')];
		const [result] = insight.analyze(findings);
		const data = result?.data as Array<{
			package: string;
			churnTotal: number;
			files: Array<{ path: string; count: number }>;
		}>;
		expect(data[0]?.files).toEqual([{ path: 'packages/cli/src/index.ts', count: 9 }]);
	});

	test('result data contains boundary violation detail', () => {
		const insight = new ErosionInsight({ packagePrefix: '@maat-tools/' });
		const findings = [churnFinding('packages/cli/src/index.ts', 9), couplingFinding('@maat-tools/cli')];
		const [result] = insight.analyze(findings);
		const data = result?.data as Array<{
			violationCount: number;
			violations: Array<{ file?: string; specifier?: string }>;
		}>;
		expect(data[0]?.violationCount).toBe(1);
		expect(data[0]?.violations[0]?.file).toBe('packages/contracts/dist/index.js');
		expect(data[0]?.violations[0]?.specifier).toBe('node:crypto');
	});

	test('layer-imports coupling variant is also matched', () => {
		const insight = new ErosionInsight({ packagePrefix: '@rocket.chat/' });
		const findings = [
			churnFinding('packages/ui-kit/src/index.ts', 8),
			couplingFinding('@rocket.chat/ui-kit', 'layer-imports'),
		];
		const results = insight.analyze(findings);
		expect(results).toHaveLength(1);
		expect(results[0]?.message).toContain('@rocket.chat/ui-kit');
	});

	test('coupling rule with non-matching pattern is ignored', () => {
		const insight = new ErosionInsight({ packagePrefix: '@maat-tools/' });
		const findings = [
			churnFinding('packages/cli/src/index.ts', 10),
			{
				ruleId: 'git/churn@v1',
				fingerprint: 'other',
				message: 'some other rule',
				artifacts: [],
			},
		];
		expect(insight.analyze(findings)).toHaveLength(0);
	});
});

// ── metadata ──────────────────────────────────────────────────────────────────

describe('ErosionInsight metadata', () => {
	test('id is stable', () => {
		expect(new ErosionInsight().id).toBe('erosion@v1');
	});

	test('needRules declares git/churn@v1', () => {
		expect(new ErosionInsight().needRules).toContain('git/churn@v1');
	});

	test('needRules declares coupling/pure-imports family', () => {
		expect(new ErosionInsight().needRules).toContain('coupling/pure-imports');
	});

	test('needRules declares coupling/layer-imports family', () => {
		expect(new ErosionInsight().needRules).toContain('coupling/layer-imports');
	});
});
