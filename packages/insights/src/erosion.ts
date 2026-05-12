import { defineInsight, type Finding, type Insight, type InsightResult } from '@maat-tools/contracts';

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
	packageName?: string;
	specifier?: string;
};
type ViolatingBoundary = {
	boundary: string;
	violations: ViolationEntry[];
};
type ErodingBoundary = {
	boundary: string;
	churn: BoundaryChurn;
	violations: ViolationEntry[];
};

export class ErosionInsight implements Insight {
	public readonly id = 'erosion@v1';
	public readonly needRules: readonly string[] = ['git/churn@v1', 'coupling/pure-imports', 'coupling/layer-imports'];

	public analyze(findings: Finding[]): InsightResult[] {
		const churnEntries = this.collectChurn(findings);
		const violatingBoundaries = this.collectViolatingBoundaries(findings);

		const eroding = [...violatingBoundaries.values()]
			.flatMap(({ boundary, violations }): ErodingBoundary[] => {
				const churn = this.churnForBoundary(boundary, violations, churnEntries);
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
			if (f.ruleId !== 'git/churn@v1') {
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
		const violating = new Map<string, ViolationEntry[]>();
		for (const f of findings) {
			const boundary = this.boundaryFromCouplingRuleId(f.ruleId);
			if (!boundary) {
				continue;
			}

			const entries = violating.get(boundary) ?? [];
			entries.push(this.violationFromFinding(f));
			violating.set(boundary, entries);
		}

		return new Map([...violating].map(([boundary, violations]) => [boundary, { boundary, violations }]));
	}

	private violationFromFinding(finding: Finding): ViolationEntry {
		const importArtifact = finding.artifacts.find((artifact) => artifact.kind === 'import');
		const data = importArtifact?.data as { file?: unknown; packageName?: unknown; specifier?: unknown } | undefined;

		return {
			ruleId: finding.ruleId,
			fingerprint: finding.fingerprint,
			message: finding.message,
			file: typeof data?.file === 'string' ? data.file : undefined,
			packageName: typeof data?.packageName === 'string' ? data.packageName : undefined,
			specifier: typeof data?.specifier === 'string' ? data.specifier : undefined,
		};
	}

	private churnForBoundary(boundary: string, violations: ViolationEntry[], churnEntries: ChurnEntry[]): BoundaryChurn {
		const files = churnEntries.filter((entry) => this.fileChurnBelongsToBoundary(entry.path, boundary, violations));

		return {
			files,
			total: files.reduce((total, entry) => total + entry.count, 0),
		};
	}

	private fileChurnBelongsToBoundary(filePath: string, boundary: string, violations: ViolationEntry[]): boolean {
		// Path-mode boundary (e.g. "./src/auth/**"): match directly by glob
		if (boundary.startsWith('./')) {
			return this.matchGlob(filePath, boundary);
		}

		// Package-mode boundary (e.g. "kernel"): boundary name appears as a directory segment in the path
		if (filePath.split('/').includes(this.lastSegment(boundary))) {
			return true;
		}

		// Fallback: infer where the boundary lives on disk from files that had violations, then check if filePath falls inside
		return this.rootsFromViolationFiles(boundary, violations).some(
			(root) => filePath === root || filePath.startsWith(`${root}/`),
		);
	}

	private formatErodingBoundary({ boundary, churn, violations }: ErodingBoundary): string {
		const hottestFile = [...churn.files].sort((a, b) => b.count - a.count)[0];
		const sampleViolation = violations.find((v) => v.specifier !== undefined) ?? violations[0];
		const hotFileText = hottestFile === undefined ? '' : `; hottest ${hottestFile.path} (${hottestFile.count} changes)`;
		const violationText = sampleViolation?.specifier === undefined ? '' : `; leaking ${sampleViolation.specifier}`;

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

	private rootsFromViolationFiles(boundary: string, violations: ViolationEntry[]): string[] {
		const roots = new Set<string>();
		const leaf = this.lastSegment(boundary);

		for (const violation of violations) {
			if (violation.file === undefined) {
				continue;
			}

			const segments = violation.file.split('/');
			const leafIndex = segments.indexOf(leaf);
			if (leafIndex >= 0) {
				roots.add(segments.slice(0, leafIndex + 1).join('/'));
				continue;
			}

			const parent = segments.slice(0, -1).join('/');
			if (parent) {
				roots.add(parent);
			}
		}

		return [...roots];
	}

	private lastSegment(boundary: string): string {
		const segments = boundary.split('/');

		return segments[segments.length - 1] ?? boundary;
	}

	private boundaryFromCouplingRuleId(ruleId: string): string | null {
		const match = ruleId.match(/^coupling\/(?:pure-imports|layer-imports):(.+)@v\d+$/);

		return match?.[1] ?? null;
	}

	private matchGlob(value: string, pattern: string): boolean {
		const normalized = pattern.startsWith('./') ? pattern.slice(2) : pattern;
		const regexStr = normalized
			.split('**')
			.map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+'))
			.join('.*');

		return new RegExp(`^${regexStr}$`).test(value);
	}

	private plural(count: number, singular: string, plural: string): string {
		return count === 1 ? singular : plural;
	}
}

export default defineInsight(() => new ErosionInsight());
