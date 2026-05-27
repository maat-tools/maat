import type { Artifact, Finding, InsightResult, Rule } from '@maat-tools/contracts';
import chalk from 'chalk';

function formatArtifact(artifact: Artifact, rule: Rule | undefined): string {
	const described = rule?.describeArtifact(artifact) ?? {
		[artifact.kind]: String(artifact.data),
	};

	return Object.entries(described)
		.map(([k, v]) => `${k}: ${v}`)
		.join(' ');
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
		if (this.silent) {
			return;
		}
		process.stdout.write(message);
	}

	public warn(message: string): void {
		if (this.silent) {
			return;
		}
		process.stderr.write(chalk.yellow(message));
	}

	public error(message: string): void {
		if (this.silent) {
			return;
		}
		process.stderr.write(chalk.red(message));
	}

	public section(heading: string): void {
		if (this.silent) {
			return;
		}
		process.stdout.write(`\n${chalk.bold(heading)}\n`);
		process.stdout.write(`${chalk.dim('─'.repeat(heading.length))}\n`);
	}

	public findings(findings: Finding[], getRule: (id: string) => Rule | undefined): void {
		if (this.silent || findings.length === 0) {
			return;
		}

		const byRule = new Map<string, Finding[]>();
		for (const f of findings) {
			const group = byRule.get(f.ruleId) ?? [];
			group.push(f);
			byRule.set(f.ruleId, group);
		}

		this.section(`FINDINGS (${findings.length})`);

		for (const [ruleId, group] of byRule) {
			const rule = getRule(ruleId);
			process.stdout.write(`\n  ${chalk.cyan(`[${ruleId}]`)} — ${group.length} finding(s)\n`);
			for (const f of group) {
				const badge = f.requiresVerification ? chalk.yellow('[Verify] ') : '';
				process.stdout.write(`    ${chalk.dim(f.fingerprint.slice(0, 8))}  ${badge}${f.message}\n`);
				for (const artifact of f.artifacts) {
					process.stdout.write(`            ${chalk.dim('↳')} ${formatArtifact(artifact, rule)}\n`);
				}
			}
		}
	}

	public runContext(lines: readonly string[]): void {
		if (this.silent) {
			return;
		}
		this.section('RUN CONTEXT');
		for (const line of lines) {
			process.stdout.write(`  ${chalk.dim('-')} ${line}\n`);
		}
	}

	public insight(result: InsightResult): void {
		if (this.silent) {
			return;
		}
		process.stdout.write(`  ${chalk.magenta(`[${result.insightId}]`)} ${result.message}\n`);
	}

	public json(data: unknown): void {
		process.stdout.write(JSON.stringify(data, null, 2));
	}

	public success(message: string): void {
		if (this.silent) {
			return;
		}
		process.stdout.write(chalk.green(message));
	}

	public detail(label: string, value: string): void {
		if (this.silent) {
			return;
		}
		process.stdout.write(`  ${chalk.bold(label)} ${value}`);
	}

	public bold(message: string): void {
		if (this.silent) {
			return;
		}
		process.stdout.write(chalk.bold(message));
	}

	public info(message: string): void {
		if (this.silent) {
			return;
		}
		process.stdout.write(chalk.cyanBright(message));
	}
}
