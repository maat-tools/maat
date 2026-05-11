import { type Finding, type Insight, type InsightResult, defineInsight } from '@maat-tools/contracts';

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

export class ErosionInsight implements Insight {
	public readonly id = 'erosion@v1';
	public readonly needRules: readonly string[] = ['git/churn@v1', 'coupling/pure-imports', 'coupling/layer-imports'];
	public readonly usesLedger = false;

	private readonly packageDir: string;
	private readonly packagePrefix: string;

	public constructor(options: ErosionOptions = {}) {
		this.packageDir = options.packageDir ?? 'packages/';
		this.packagePrefix = options.packagePrefix ?? '';
	}

	public analyze(findings: Finding[]): InsightResult[] {
		const churnByPackage = this.buildChurnMap(findings);
		const violatingPackages = this.collectViolatingPackages(findings);

		const eroding = [...churnByPackage.entries()]
			.filter(([pkg]) => violatingPackages.has(pkg))
			.sort(([, a], [, b]) => b.total - a.total);

		if (eroding.length === 0) return [];

		const summary = eroding.map(([pkg, { total }]) => `${pkg} (${total} changes)`).join(', ');
		return [
			{
				insightId: this.id,
				message: `${eroding.length} package(s) are both high-churn and violating layer constraints — eroding: ${summary}`,
				data: eroding.map(([pkg, { total, files }]) => ({ package: pkg, churnTotal: total, files })),
			},
		];
	}

	private buildChurnMap(findings: Finding[]): Map<string, PackageChurn> {
		const churnByPackage = new Map<string, PackageChurn>();

		for (const f of findings) {
			if (f.ruleId !== 'git/churn@v1') continue;
			for (const a of f.artifacts) {
				if (a.kind !== 'git-churn') continue;
				const d = a.data as ChurnEntry;
				const pkg = this.fileToPackage(d.path);
				if (!pkg) continue;
				const entry = churnByPackage.get(pkg) ?? { files: [], total: 0 };
				entry.files.push(d);
				entry.total += d.count;
				churnByPackage.set(pkg, entry);
			}
		}

		return churnByPackage;
	}

	private collectViolatingPackages(findings: Finding[]): Set<string> {
		const violating = new Set<string>();
		for (const f of findings) {
			const pkg = ErosionInsight.packageFromCouplingRuleId(f.ruleId);
			if (pkg) violating.add(pkg);
		}
		return violating;
	}

	private fileToPackage(path: string): string | null {
		if (!path.startsWith(this.packageDir)) return null;
		const rest = path.slice(this.packageDir.length);
		const segment = rest.split('/')[0];
		if (!segment) return null;
		return this.packagePrefix + segment;
	}

	private static packageFromCouplingRuleId(ruleId: string): string | null {
		const match = ruleId.match(/^coupling\/(?:pure-imports|layer-imports):(.+)@v\d+$/);
		return match?.[1] ?? null;
	}
}

export default defineInsight((options?: ErosionOptions) => new ErosionInsight(options));
