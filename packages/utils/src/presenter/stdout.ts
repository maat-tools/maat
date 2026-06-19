import {
	type Artifact,
	type AxiomEvent,
	type Finding,
	FindingStatus,
	type InsightResult,
	type Rule,
} from '@maat-tools/contracts';
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

		const byFingerprint = new Map<string, Finding[]>();
		const byRule = new Map<string, typeof byFingerprint>();
		for (const f of findings) {
			const group = byRule.get(f.ruleId) ?? new Map<string, Finding[]>();
			const fingerprintGroup = group.get(f.fingerprint) ?? [];
			fingerprintGroup.push(f);
			group.set(f.fingerprint, fingerprintGroup);
			byRule.set(f.ruleId, group);
		}

		for (const [ruleId, group] of byRule) {
			const rule = getRule(ruleId);
			process.stdout.write(`\n  ${chalk.cyan(`[${ruleId}]`)} — ${group.size} finding(s)\n`);
			for (const [fingerprint, findings] of group) {
				if (findings.length === 0) {
					continue;
				}
				const badge = findings.some((f) => f.requiresVerification) ? chalk.yellow('[Verify] ') : '';
				const message = findings[0]?.message;
				process.stdout.write(`    ${chalk.dim(fingerprint)}  ${badge}${message}\n`);
				for (const f of findings) {
					for (const artifact of f.artifacts) {
						process.stdout.write(`            ${chalk.dim('↳')} ${formatArtifact(artifact, rule)}\n`);
					}
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

	public axiomEntry(axiom: AxiomEvent): void {
		if (this.silent) {
			return;
		}
		if (axiom.type === FindingStatus.AXIOM_DECLARED) {
			process.stdout.write(`\n  ${chalk.cyan(axiom.axiomId)}\n`);
			process.stdout.write(`    ${chalk.bold('scope:')} ${axiom.scope}\n`);
			process.stdout.write(`    ${chalk.bold('claim:')} ${axiom.claim}\n`);
			process.stdout.write(`    ${chalk.bold('status:')} ${chalk.green('active')}\n`);
			if (axiom.note) {
				process.stdout.write(`    ${chalk.bold('note:')} ${axiom.note}\n`);
			}
		}

		if (axiom.type === FindingStatus.AXIOM_SUPERSEDED) {
			process.stdout.write(`\n  ${chalk.yellow(axiom.axiomId)}\n`);
			process.stdout.write(`    ${chalk.bold('reason:')} ${axiom.reason}\n`);
			process.stdout.write(`    ${chalk.bold('status:')} ${chalk.yellow('superseded')}\n`);
			if (axiom.scope) {
				process.stdout.write(`    ${chalk.bold('scope:')} ${axiom.scope}\n`);
			}
			if (axiom.claim) {
				process.stdout.write(`    ${chalk.bold('claim:')} ${axiom.claim}\n`);
			}
		}

		if (axiom.type === FindingStatus.AXIOM_REVOKED) {
			process.stdout.write(`\n  ${chalk.red(axiom.axiomId)}\n`);
			process.stdout.write(`    ${chalk.bold('reason:')} ${axiom.reason}\n`);
			process.stdout.write(`    ${chalk.bold('status:')} ${chalk.red('revoked')}\n`);
			if (axiom.scope) {
				process.stdout.write(`    ${chalk.bold('scope:')} ${axiom.scope}\n`);
			}
			if (axiom.claim) {
				process.stdout.write(`    ${chalk.bold('claim:')} ${axiom.claim}\n`);
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
