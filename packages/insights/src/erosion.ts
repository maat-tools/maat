import { defineInsight, type Finding, type Insight, type InsightResult } from '@maat-tools/contracts';

declare module '@maat-tools/contracts' {
	interface InsightRegistry {
		'@maat-tools/insights/erosion': ErosionOptions;
	}
}

export type ErosionOptions = {
	packageDir?: string;
	packagePrefix?: string;
};

type ChurnEntry = { path: string; count: number };
type PackageChurn = { files: ChurnEntry[]; total: number };
type ViolationEntry = { ruleId: string; fingerprint: string; message: string; file?: string; specifier?: string };
type ErodingPackage = {
	package: string;
	churn: PackageChurn;
	violations: ViolationEntry[];
};

export class ErosionInsight implements Insight {
	public readonly id = 'erosion@v1';
	public readonly needRules: readonly string[] = ['git/churn@v1', 'coupling/pure-imports', 'coupling/layer-imports'];

	private readonly packageDir: string;
	private readonly packagePrefix: string;

	public constructor(options: ErosionOptions = {}) {
		this.packageDir = options.packageDir ?? 'packages/';
		this.packagePrefix = options.packagePrefix ?? '';
	}

	public analyze(findings: Finding[]): InsightResult[] {
		const churnByPackage = this.buildChurnMap(findings);
		const violationsByPackage = this.collectViolatingPackages(findings);

		const eroding = [...churnByPackage.entries()]
			.flatMap(([pkg, churn]): ErodingPackage[] => {
				const violations = violationsByPackage.get(pkg);
				return violations === undefined ? [] : [{ package: pkg, churn, violations }];
			})
			.sort((a, b) => b.churn.total - a.churn.total);

		if (eroding.length === 0) {
			return [];
		}

		const summary = eroding.map((pkg) => this.formatErodingPackage(pkg)).join('; ');
		return [
			{
				insightId: this.id,
				message: `hot architectural debt in ${eroding.length} package(s): ${summary}`,
				data: eroding.map(({ package: pkg, churn, violations }) => ({
					package: pkg,
					churnTotal: churn.total,
					files: churn.files,
					violationCount: violations.length,
					violations,
				})),
			},
		];
	}

	private buildChurnMap(findings: Finding[]): Map<string, PackageChurn> {
		const churnByPackage = new Map<string, PackageChurn>();

		for (const f of findings) {
			if (f.ruleId !== 'git/churn@v1') {
				continue;
			}
			for (const a of f.artifacts) {
				if (a.kind !== 'git-churn') {
					continue;
				}
				const d = a.data as ChurnEntry;
				const pkg = this.fileToPackage(d.path);
				if (!pkg) {
					continue;
				}
				const entry = churnByPackage.get(pkg) ?? { files: [], total: 0 };
				entry.files.push(d);
				entry.total += d.count;
				churnByPackage.set(pkg, entry);
			}
		}

		return churnByPackage;
	}

	private collectViolatingPackages(findings: Finding[]): Map<string, ViolationEntry[]> {
		const violating = new Map<string, ViolationEntry[]>();
		for (const f of findings) {
			const pkg = ErosionInsight.packageFromCouplingRuleId(f.ruleId);
			if (!pkg) {
				continue;
			}

			const entries = violating.get(pkg) ?? [];
			entries.push(this.violationFromFinding(f));
			violating.set(pkg, entries);
		}
		return violating;
	}

	private violationFromFinding(finding: Finding): ViolationEntry {
		const importArtifact = finding.artifacts.find((artifact) => artifact.kind === 'import');
		const data = importArtifact?.data as { file?: unknown; specifier?: unknown } | undefined;

		return {
			ruleId: finding.ruleId,
			fingerprint: finding.fingerprint,
			message: finding.message,
			file: typeof data?.file === 'string' ? data.file : undefined,
			specifier: typeof data?.specifier === 'string' ? data.specifier : undefined,
		};
	}

	private formatErodingPackage({ package: pkg, churn, violations }: ErodingPackage): string {
		const hottestFile = [...churn.files].sort((a, b) => b.count - a.count)[0];
		const sampleViolation = violations.find((v) => v.specifier !== undefined) ?? violations[0];
		const hotFileText = hottestFile === undefined ? '' : `; hottest ${hottestFile.path} (${hottestFile.count} changes)`;
		const violationText = sampleViolation?.specifier === undefined ? '' : `; leaking ${sampleViolation.specifier}`;

		return `${pkg} (${churn.total} changes across ${churn.files.length} ${ErosionInsight.plural(
			churn.files.length,
			'hot file',
			'hot files',
		)}, ${violations.length} ${ErosionInsight.plural(
			violations.length,
			'boundary violation',
			'boundary violations',
		)}${hotFileText}${violationText})`;
	}

	private fileToPackage(path: string): string | null {
		if (!path.startsWith(this.packageDir)) {
			return null;
		}
		const rest = path.slice(this.packageDir.length);
		const segment = rest.split('/')[0];
		if (!segment) {
			return null;
		}
		return this.packagePrefix + segment;
	}

	private static packageFromCouplingRuleId(ruleId: string): string | null {
		const match = ruleId.match(/^coupling\/(?:pure-imports|layer-imports):(.+)@v\d+$/);
		return match?.[1] ?? null;
	}

	private static plural(count: number, singular: string, plural: string): string {
		return count === 1 ? singular : plural;
	}
}

export default defineInsight((options?: ErosionOptions) => new ErosionInsight(options));
