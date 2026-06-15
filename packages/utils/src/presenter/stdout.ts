import type { Artifact, AxiomDeclaredEvent, Finding, InsightResult, Rule } from '@maat-tools/contracts';
import chalk from 'chalk';

function formatArtifact(artifact: Artifact, rule: Rule | undefined): string {
	const described = rule?.describeArtifact(artifact) ?? {
		[artifact.kind]: String(artifact.data),
	};

	return Object.entries(described)
		.map(([k, v]) => `${chalk.bold(k)}: ${v}`)
		.join(' ');
}

export class StdoutPresenter {
	private readonly silent: boolean;

	public constructor(options: { silent?: boolean } = {}) {
		this.silent = options.silent ?? false;
	}

	public asSilent(): StdoutPresenter {
		return new StdoutPresenter({ silent: true });
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

	public findingGroup(findings: Finding[], getRule: (id: string) => Rule | undefined): void {
		if (this.silent || findings.length === 0) {
			return;
		}

		const byRule = new Map<string, Finding[]>();
		for (const f of findings) {
			const group = byRule.get(f.ruleId) ?? [];
			group.push(f);
			byRule.set(f.ruleId, group);
		}

		for (const [ruleId, group] of byRule) {
			const rule = getRule(ruleId);
			process.stdout.write(`\n  ${chalk.cyan(`[${ruleId}]`)} — ${group.length} finding(s)\n`);
			for (const f of group) {
				const badge = f.requiresVerification ? chalk.yellow('[Verify] ') : '';
				process.stdout.write(`    ${chalk.dim(f.fingerprint)}  ${badge}${f.message}\n`);
				for (const artifact of f.artifacts) {
					process.stdout.write(`            ${chalk.dim('↳')} ${formatArtifact(artifact, rule)}\n`);
				}
			}
		}
	}

	public findings(findings: Finding[], getRule: (id: string) => Rule | undefined): void {
		if (this.silent || findings.length === 0) {
			return;
		}

		this.section(`FINDINGS (${findings.length})`);
		this.findingGroup(findings, getRule);
	}

	public axiomEntry(axiom: AxiomDeclaredEvent): void {
		if (this.silent) {
			return;
		}
		process.stdout.write(`\n  ${chalk.cyan(axiom.axiomId)}\n`);
		process.stdout.write(`    ${chalk.bold('scope:')} ${axiom.scope}\n`);
		process.stdout.write(`    ${chalk.bold('claim:')} ${axiom.claim}\n`);
		if (axiom.note) {
			process.stdout.write(`    ${chalk.bold('note:')} ${axiom.note}\n`);
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
		process.stdout.write(`  ${chalk.greenBright(`[${result.insightId}]`)} ${result.message}\n`);
	}

	public insightEntry(result: InsightResult): void {
		if (this.silent) {
			return;
		}
		process.stdout.write(`\n  ${chalk.greenBright(`[${result.insightId}]`)}\n`);
		process.stdout.write(`    ${chalk.bold('message:')} ${result.message}\n`);
		if (result.data !== undefined && result.data !== null) {
			const dataStr = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
			process.stdout.write(`    ${chalk.bold('data:')}\n`);
			for (const line of dataStr.split('\n')) {
				process.stdout.write(`      ${line}\n`);
			}
		}
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
