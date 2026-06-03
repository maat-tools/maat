import { defineInsight, type Finding, type Insight, type InsightResult } from '@maat-tools/contracts';
import { isMatch } from '@maat-tools/utils';
import type { DependsOn } from '@maat-tools/vocabulary';

declare module '@maat-tools/contracts' {
	interface InsightRegistry {
		'@maat-tools/insights/erosion': ErosionOptions;
	}
}

export type ErosionOptions = {
	readonly [key: string]: never;
};

type ChurnEntry = { path: string; count: number };
type BoundaryChurn = { files: ChurnEntry[]; total: number };
type ViolationEntry = {
	ruleId: string;
	fingerprint: string;
	message: string;
	file?: string;
	dependency?: string;
};
type ViolatingBoundary = {
	boundary: string;
	rootGlob: string;
	violations: ViolationEntry[];
};
type ErodingBoundary = {
	boundary: string;
	churn: BoundaryChurn;
	violations: ViolationEntry[];
};

export class ErosionInsight implements Insight {
	public readonly id = 'maat-tools/erosion@v1';
	public readonly needRules: readonly string[] = [
		'maat-tools/git-rules/churn@v1',
		'maat-tools/coupling-rules/pure-imports@v1',
		'maat-tools/coupling-rules/layer-imports@v1',
	];

	public analyze(findings: Finding[]): InsightResult[] {
		const churnEntries = this.collectChurn(findings);
		const violatingBoundaries = this.collectViolatingBoundaries(findings);

		const eroding = [...violatingBoundaries.values()]
			.flatMap(({ boundary, rootGlob, violations }): ErodingBoundary[] => {
				const churn = this.churnForBoundary(rootGlob, churnEntries);
				return churn.total === 0 ? [] : [{ boundary, churn, violations }];
			})
			.sort((a, b) => b.churn.total - a.churn.total);

		if (eroding.length === 0) {
			return [];
		}

		const summary = eroding.map((boundary) => this.formatErodingBoundary(boundary)).join('; ');

		return [
			{
				insightId: this.id,
				message: `hot architectural debt in ${eroding.length} boundary(s): ${summary}`,
				data: eroding.map(({ boundary, churn, violations }) => ({
					boundary,
					churnTotal: churn.total,
					files: churn.files,
					violationCount: violations.length,
					violations,
				})),
			},
		];
	}

	private collectChurn(findings: Finding[]): ChurnEntry[] {
		const entries: ChurnEntry[] = [];

		for (const f of findings) {
			if (f.ruleId !== 'maat-tools/git-rules/churn@v1') {
				continue;
			}

			for (const a of f.artifacts) {
				if (a.kind !== 'git-churn') {
					continue;
				}

				const d = a.data as ChurnEntry;
				if (typeof d.path === 'string' && typeof d.count === 'number') {
					entries.push(d);
				}
			}
		}

		return entries;
	}

	private collectViolatingBoundaries(findings: Finding[]): Map<string, ViolatingBoundary> {
		const violating = new Map<string, ViolatingBoundary>();
		for (const f of findings) {
			if (!this.isCouplingFinding(f.ruleId)) {
				continue;
			}

			const colonIndex = f.instanceId.indexOf(':');
			if (colonIndex === -1) {
				continue;
			}

			const target = f.instanceId.slice(colonIndex + 1);
			const dep = f.artifacts.find((a) => a.kind === 'dependsOn')?.data as DependsOn | undefined;
			const rootGlob = dep?.from.package?.name === target ? `${dep.from.package.rootPath ?? target}/**` : target;

			const existing = violating.get(target);
			if (existing) {
				existing.violations.push(this.violationFromFinding(f));
			} else {
				violating.set(target, { boundary: target, rootGlob, violations: [this.violationFromFinding(f)] });
			}
		}

		return violating;
	}

	private violationFromFinding(finding: Finding): ViolationEntry {
		const dependsOnArtifact = finding.artifacts.find((artifact) => artifact.kind === 'dependsOn');
		const data = dependsOnArtifact?.data as DependsOn | undefined;

		return {
			ruleId: finding.ruleId,
			fingerprint: finding.fingerprint,
			message: finding.message,
			file: typeof data?.from.path === 'string' ? data.from.path : undefined,
			dependency: typeof data?.to.path === 'string' ? data.to.path : undefined,
		};
	}

	private churnForBoundary(rootGlob: string, churnEntries: ChurnEntry[]): BoundaryChurn {
		const files = churnEntries.filter((entry) => isMatch(entry.path, rootGlob));

		return {
			files,
			total: files.reduce((total, entry) => total + entry.count, 0),
		};
	}

	private formatErodingBoundary({ boundary, churn, violations }: ErodingBoundary): string {
		const hottestFile = [...churn.files].sort((a, b) => b.count - a.count)[0];
		const sampleViolation = violations.find((v) => v.dependency !== undefined) ?? violations[0];
		const hotFileText = hottestFile === undefined ? '' : `; hottest ${hottestFile.path} (${hottestFile.count} changes)`;
		const violationText = sampleViolation?.dependency === undefined ? '' : `; leaking ${sampleViolation.dependency}`;

		return `${boundary} (${churn.total} changes across ${churn.files.length} ${this.plural(
			churn.files.length,
			'hot file',
			'hot files',
		)}, ${violations.length} ${this.plural(
			violations.length,
			'boundary violation',
			'boundary violations',
		)}${hotFileText}${violationText})`;
	}

	private isCouplingFinding(ruleId: string): boolean {
		return /^maat-tools\/coupling-rules\/(pure-imports|layer-imports)@v\d+$/.test(ruleId);
	}

	private plural(count: number, singular: string, plural: string): string {
		return count === 1 ? singular : plural;
	}
}

export default defineInsight(() => new ErosionInsight());
