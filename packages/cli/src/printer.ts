import type { Artifact, Finding, InsightResult, Rule } from '@maat/contracts';
import chalk from 'chalk';

function formatArtifact(artifact: Artifact, rule: Rule | undefined): string {
	const described = rule?.describeArtifact(artifact) ?? {
		[artifact.kind]: String(artifact.data),
	};
	return Object.entries(described)
		.map(([k, v]) => `${k}: ${v}`)
		.join('  ');
}

export class Printer {
	private readonly silent: boolean;

	public constructor(options: { silent?: boolean } = {}) {
		this.silent = options.silent ?? false;
	}

	public asSilent(): Printer {
		return new Printer({ silent: true });
	}

	public log(message: string): void {
		if (this.silent) return;
		console.log(message);
	}

	public warn(message: string): void {
		if (this.silent) return;
		console.warn(chalk.yellow(message));
	}

	public error(message: string): void {
		if (this.silent) return;
		console.error(chalk.red(message));
	}

	public section(heading: string): void {
		if (this.silent) return;
		console.log(`\n${chalk.bold(heading)}`);
		console.log(chalk.dim('─'.repeat(heading.length)));
	}

	public findings(findings: Finding[], getRule: (id: string) => Rule | undefined): void {
		if (this.silent || findings.length === 0) return;

		const byRule = new Map<string, Finding[]>();
		for (const f of findings) {
			const group = byRule.get(f.ruleId) ?? [];
			group.push(f);
			byRule.set(f.ruleId, group);
		}

		this.section(`FINDINGS (${findings.length})`);

		for (const [ruleId, group] of byRule) {
			const rule = getRule(ruleId);
			console.log(`\n  ${chalk.cyan(`[${ruleId}]`)} — ${group.length} finding(s)`);
			for (const f of group) {
				console.log(`    ${chalk.dim(f.fingerprint.slice(0, 8))}  ${f.message}`);
				for (const artifact of f.artifacts) {
					console.log(`            ${chalk.dim('↳')} ${formatArtifact(artifact, rule)}`);
				}
			}
		}
	}

	public insight(result: InsightResult): void {
		if (this.silent) return;
		console.log(`${chalk.magenta(`[Insight: ${result.insightId}]`)} ${result.message}`, result.data);
	}

	public json(data: unknown): void {
		console.log(JSON.stringify(data, null, 2));
	}
}
