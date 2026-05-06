#!/usr/bin/env bun

import {
	type Insight,
	isCollector,
	isCollectorFactory,
	isInsight,
	isInsightFactory,
	isInsightSet,
	isLedgerBackendFactory,
	isRule,
	isRuleBuilder,
	isRuleFactory,
	isRuleSet,
	type LedgerBackend,
} from '@maat/contracts';
import type { MaatConfig } from '@maat/core';
import { Kernel } from '@maat/kernel';
import { Command } from 'commander';
import type { MaatCommand } from './commands';
import { Axiom } from './commands/axiom';
import { Baseline } from './commands/baseline';
import { Check } from './commands/check';
import { Promote } from './commands/promote';
import { Resolve } from './commands/resolve';
import { Visualize } from './commands/visualize';
import { loadMaatConfig } from './config';

class MaatCLI {
	private program: Command = new Command();
	private kernel: Kernel = new Kernel();
	private ledger: LedgerBackend | null = null;
	private insights: Insight[] = [];

	public constructor() {
		this.registerCLIInfo();
	}

	public async run(argv = process.argv) {
		if (isHelpOrVersionRequest(argv)) {
			this.registerCommands(
				{ collectors: [], rules: [] },
				{
					warnMissingLedger: false,
				},
			);
			this.program.parse(argv);
			return;
		}

		const loadedConfig = await loadMaatConfig({
			argv: argv.slice(2),
			cwd: process.cwd(),
			env: process.env,
		});
		process.chdir(loadedConfig.rootDir);

		await this.configureKernel(loadedConfig.config);
		await this.configureInsights(loadedConfig.config);
		await this.configureLedger(loadedConfig.config);
		this.registerCommands(loadedConfig.config);
		this.program.parse(argv);
	}

	private registerCommands(
		maatConfig: MaatConfig,
		options: { warnMissingLedger?: boolean } = {},
	) {
		if (!this.ledger) {
			if (options.warnMissingLedger ?? true) {
				console.warn(
					'No ledger configured. Ledger-backed commands will require a ledger before they can run.',
				);
			}
		}
		const config = {
			...maatConfig,
			check: maatConfig.check ?? { strict: true },
		};
		const commands: MaatCommand[] = [
			new Check(this.program, config, this.kernel, this.ledger, this.insights),
			new Axiom(this.program, config, this.kernel, this.ledger, this.insights),
			new Baseline(
				this.program,
				config,
				this.kernel,
				this.ledger,
				this.insights,
			),
			new Promote(
				this.program,
				config,
				this.kernel,
				this.ledger,
				this.insights,
			),
			new Resolve(
				this.program,
				config,
				this.kernel,
				this.ledger,
				this.insights,
			),
			new Visualize(
				this.program,
				config,
				this.kernel,
				this.ledger,
				this.insights,
			),
		];

		for (const command of commands) {
			command.register();
		}
	}

	private registerCLIInfo() {
		this.program
			.name('maat')
			.description('maat cli')
			.version('0.0.1')
			.option('-c, --config <path>', 'Path to a maat config file');
	}

	private async configureInsights(maatConfig: MaatConfig) {
		for (const insightEntry of maatConfig.insights ?? []) {
			const [insightId, options] =
				typeof insightEntry === 'string' ? [insightEntry, {}] : insightEntry;

			const mod = await import(insightId);
			const exported = mod.default;

			if (isInsightSet(exported)) {
				for (const factory of exported.factories) {
					this.insights.push(factory(options));
				}
			} else if (isInsightFactory(exported)) {
				const insight = exported(options as Record<string, never>);

				if (!isInsight(insight)) {
					throw new Error(
						`Insight "${insightId}" factory did not return a valid Insight. ` +
							`Ensure the returned object has id, needRules, and analyze().`,
					);
				}

				this.insights.push(insight);
			} else {
				throw new Error(
					`Insight "${insightId}" default export is not a valid InsightFactory or InsightSet. ` +
						`Use defineInsight() or defineInsightSet() from @maat/contracts to define it.`,
				);
			}
		}
	}

	private async configureLedger(maatConfig: MaatConfig) {
		if (!maatConfig.ledger) {
			return;
		}

		const [backendId, options] =
			typeof maatConfig.ledger === 'string'
				? [maatConfig.ledger, {}]
				: maatConfig.ledger;

		const mod = await import(backendId);
		const factory = mod.default;

		if (!isLedgerBackendFactory(factory)) {
			throw new Error(
				`Ledger backend "${backendId}" default export is not a valid LedgerBackendFactory. ` +
					`Use defineLedgerBackend() from @maat/contracts to define it.`,
			);
		}

		this.ledger = factory(options);
	}

	private async configureKernel(maatConfig: MaatConfig) {
		for (const collectorEntry of maatConfig.collectors) {
			const [collectorId, options] =
				typeof collectorEntry === 'string'
					? [collectorEntry, {}]
					: collectorEntry;

			const mod = await import(collectorId);
			const factory = mod.default;

			if (!isCollectorFactory(factory)) {
				throw new Error(
					`Plugin "${collectorId}" default export is not a valid CollectorFactory. ` +
						`Use defineCollector() from @maat/contracts to define it.`,
				);
			}

			const collector = factory(options);

			if (!isCollector(collector)) {
				throw new Error(
					`Plugin "${collectorId}" factory did not return a valid Collector. ` +
						`Ensure the returned object has id, provideFacts, and collect().`,
				);
			}

			this.kernel.registerCollector(collector);
		}

		for (const ruleEntry of maatConfig.rules) {
			if (isRule(ruleEntry)) {
				this.kernel.registerRule(ruleEntry);
				continue;
			}

			if (isRuleBuilder(ruleEntry)) {
				this.kernel.registerRule(ruleEntry.build());
				continue;
			}

			const [ruleId, options] =
				typeof ruleEntry === 'string' ? [ruleEntry, {}] : ruleEntry;

			const mod = await import(ruleId);
			const exported = mod.default;

			if (isRuleSet(exported)) {
				for (const factory of exported.factories) {
					this.kernel.registerRule(factory(options));
				}
			} else if (isRuleFactory(exported)) {
				const rule = exported(options);
				if (!isRule(rule)) {
					throw new Error(
						`Plugin "${ruleId}" factory did not return a valid Rule. ` +
							`Ensure the returned object has id, needs, and evaluate().`,
					);
				}
				this.kernel.registerRule(rule);
			} else {
				throw new Error(
					`Plugin "${ruleId}" default export is not a valid RuleFactory or RuleSet. ` +
						`Use defineRule() or defineRuleSet() from @maat/contracts to define it.`,
				);
			}
		}
	}
}

function isHelpOrVersionRequest(argv: string[]): boolean {
	return (
		argv.includes('--help') ||
		argv.includes('-h') ||
		argv.includes('--version') ||
		argv.includes('-V')
	);
}

new MaatCLI().run().catch((error) => {
	console.error(
		`[maat] ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
});
