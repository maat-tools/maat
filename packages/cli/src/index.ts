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
} from '@maat-tools/contracts';
import type { MaatConfig } from '@maat-tools/core';
import { Kernel } from '@maat-tools/kernel';
import { Command } from 'commander';
import type { MaatCommand } from './commands';
import { Axiom } from './commands/axiom';
import { Baseline } from './commands/baseline';
import { Check } from './commands/check';
import { Resolve } from './commands/resolve';
import { Visualize } from './commands/visualize';
import { loadMaatConfig } from './config';
import { Printer } from './printer';

type PluginEntry = string | [string, Record<string, unknown>];

function resolveEntry(entry: PluginEntry): [string, Record<string, unknown>] {
	return typeof entry === 'string' ? [entry, {}] : entry;
}

function isHelpOrVersionRequest(argv: string[]): boolean {
	return argv.includes('--help') || argv.includes('-h') || argv.includes('--version') || argv.includes('-V');
}

class MaatCLI {
	private program: Command = new Command();
	private kernel: Kernel = new Kernel();
	private ledger: LedgerBackend | null = null;
	private insights: Insight[] = [];
	private printer: Printer = new Printer();

	public constructor() {
		this.program
			.name('maat')
			.description('maat cli')
			.version('0.1.0')
			.option('-c, --config <path>', 'Path to a maat config file');
	}

	public async run(argv = process.argv) {
		if (isHelpOrVersionRequest(argv)) {
			this.registerCommands({ collectors: [], rules: [] }, { warnMissingLedger: false });
			this.program.parse(argv);
			return;
		}

		const loadedConfig = await loadMaatConfig({
			argv: argv.slice(2),
			cwd: process.cwd(),
			env: process.env,
		});
		process.chdir(loadedConfig.rootDir);

		await this.registerCollectors(loadedConfig.config);
		await this.registerRules(loadedConfig.config);
		await this.configureInsights(loadedConfig.config);
		await this.configureLedger(loadedConfig.config);
		this.registerCommands(loadedConfig.config);
		this.program.parse(argv);
	}

	private registerCommands(maatConfig: MaatConfig, options: { warnMissingLedger?: boolean } = {}) {
		if (!this.ledger && (options.warnMissingLedger ?? true)) {
			this.printer.warn('No ledger configured. Ledger-backed commands will require a ledger before they can run.');
		}

		const config = { ...maatConfig, check: maatConfig.check ?? { strict: true } };
		const args = [this.program, config, this.kernel, this.insights, this.printer, this.ledger] as const;
		const commands: MaatCommand[] = [
			new Check(...args),
			new Axiom(...args),
			new Baseline(...args),
			new Resolve(...args),
			new Visualize(...args),
		];

		for (const command of commands) {
			command.register();
		}
	}

	private async registerCollectors(maatConfig: MaatConfig) {
		for (const entry of maatConfig.collectors) {
			const [collectorId, options] = resolveEntry(entry as PluginEntry);
			const factory = (await import(collectorId)).default;

			if (!isCollectorFactory(factory)) {
				throw new Error(
					`Plugin "${collectorId}" default export is not a valid CollectorFactory. ` +
						`Use defineCollector() from @maat-tools/contracts to define it.`,
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
	}

	private async registerRules(maatConfig: MaatConfig) {
		for (const ruleEntry of maatConfig.rules) {
			if (isRule(ruleEntry)) {
				this.kernel.registerRule(ruleEntry);
				continue;
			}

			if (isRuleBuilder(ruleEntry)) {
				this.kernel.registerRule(ruleEntry.build());
				continue;
			}

			const [ruleId, options] = resolveEntry(ruleEntry as PluginEntry);
			const exported = (await import(ruleId)).default;

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
						`Use defineRule() or defineRuleSet() from @maat-tools/contracts to define it.`,
				);
			}
		}
	}

	private async configureInsights(maatConfig: MaatConfig) {
		for (const entry of maatConfig.insights ?? []) {
			if (isInsight(entry)) {
				this.insights.push(entry);
				continue;
			}

			const [insightId, options] = resolveEntry(entry as PluginEntry);
			const exported = (await import(insightId)).default;

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
						`Use defineInsight() or defineInsightSet() from @maat-tools/contracts to define it.`,
				);
			}
		}
	}

	private async configureLedger(maatConfig: MaatConfig) {
		if (!maatConfig.ledger) {
			return;
		}

		const [backendId, options] = resolveEntry(maatConfig.ledger as PluginEntry);
		const factory = (await import(backendId)).default;

		if (!isLedgerBackendFactory(factory)) {
			throw new Error(
				`Ledger backend "${backendId}" default export is not a valid LedgerBackendFactory. ` +
					`Use defineLedgerBackend() from @maat-tools/contracts to define it.`,
			);
		}

		this.ledger = factory(options);
	}
}

new MaatCLI().run().catch((error) => {
	console.error(`[maat] ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
