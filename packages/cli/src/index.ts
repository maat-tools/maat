import {
	type Insight,
	isCollector,
	isCollectorFactory,
	isEnricher,
	isEnricherFactory,
	isInsight,
	isInsightFactory,
	isInsightSet,
	isLedgerBackendFactory,
	isRule,
	isRuleFactory,
	isRuleSet,
	type LedgerBackend,
} from '@maat-tools/contracts';
import type { MaatConfig } from '@maat-tools/core';
import { Kernel } from '@maat-tools/kernel';
import { getFileURL, requireFile, resolveModule, StdoutPresenter } from '@maat-tools/utils';
import { Command } from 'commander';
import type { MaatCommand } from './commands';
import { Axiom } from './commands/axiom';
import { Baseline } from './commands/baseline';
import { Check } from './commands/check';
import { Resolve } from './commands/resolve';
import { Verify } from './commands/verify';
import { Visualize } from './commands/visualize';
import { loadMaatConfig } from './config';

const { version } = requireFile('../package.json', import.meta.url) as { version: string };

type PluginEntry = string | [string, Record<string, unknown>];

function resolveEntry(entry: PluginEntry): [string, Record<string, unknown>] {
	return typeof entry === 'string' ? [entry, {}] : entry;
}

function isHelpOrVersionRequest(argv: string[]): boolean {
	return argv.includes('--help') || argv.includes('-h') || argv.includes('--version') || argv.includes('-V');
}

const defaultStrictness = { strict: true };

class MaatCLI {
	private program: Command = new Command();
	private kernel: Kernel = new Kernel();
	private ledger: LedgerBackend | null = null;
	private insights: Insight[] = [];
	private presenter: StdoutPresenter = new StdoutPresenter();
	private configFilePath = '';
	private resolvedPluginPaths = new Set<string>();

	public constructor() {
		this.program
			.name('maat')
			.description('maat cli')
			.version(version)
			.option('-c, --config <path>', 'Path to a maat config file');
	}

	public async run(argv = process.argv) {
		if (isHelpOrVersionRequest(argv)) {
			this.registerNoopCommands();
			await this.program.parseAsync(argv);
			return;
		}
		const cliArguments = argv.slice(2);

		const loadedConfig = await loadMaatConfig({
			argv: cliArguments,
			cwd: process.cwd(),
			env: process.env,
		});

		this.configFilePath = loadedConfig.filePath;
		process.chdir(loadedConfig.rootDir);

		await this.registerCollectors(loadedConfig.config);
		await this.registerEnrichers(loadedConfig.config);
		await this.registerRules(loadedConfig.config);
		await this.configureInsights(loadedConfig.config);
		await this.configureLedger(loadedConfig.config);

		if (!this.ledger) {
			this.presenter.warn('No ledger configured. Ledger-backed commands will require a ledger before they can run.\n');
		}

		this.registerCommands(loadedConfig.config);

		const commandName = cliArguments.find((a) => !a.startsWith('-'));
		if (commandName && !argv.includes('--silent')) {
			this.trackPerformance(commandName);
		}

		await this.program.parseAsync(argv);
	}

	private trackPerformance(commandName: string) {
		const start = performance.now();
		process.on('exit', () => {
			const elapsed = ((performance.now() - start) / 1000).toFixed(2);
			process.stderr.write(`${commandName} took ${elapsed}s\n`);
		});
	}

	private registerNoopCommands() {
		this.registerCommands({ collectors: [], rules: [] });
	}

	private registerCommands(maatConfig: MaatConfig) {
		const config = { ...maatConfig, check: maatConfig.check ?? defaultStrictness };
		const args = [this.program, config, this.kernel, this.insights, this.presenter, this.ledger] as const;

		const commands: MaatCommand[] = [
			new Check(...args),
			new Axiom(...args),
			new Baseline(...args),
			new Resolve(...args),
			new Verify(...args),
			new Visualize(...args),
		];

		for (const command of commands) {
			command.register();
		}
	}

	private resolvePlugin(id: string): string {
		const resolved = resolveModule(this.configFilePath, id);
		const fileUrl = getFileURL(resolved);
		if (this.resolvedPluginPaths.has(fileUrl)) {
			throw new Error(`Plugin "${id}" is already registered`);
		}
		this.resolvedPluginPaths.add(fileUrl);

		return fileUrl;
	}

	private async registerCollectors(maatConfig: MaatConfig) {
		for (const entry of maatConfig.collectors) {
			if (isCollector(entry)) {
				this.kernel.registerCollector(entry);
				continue;
			}

			const [collectorId, options] = resolveEntry(entry as unknown as PluginEntry);
			const factory = (await import(this.resolvePlugin(collectorId))).default;

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

			const [ruleId, options] = resolveEntry(ruleEntry as PluginEntry);
			const exported = (await import(this.resolvePlugin(ruleId))).default;

			if (!isRuleFactory(exported) && !isRuleSet(exported)) {
				throw new Error(
					`Plugin "${ruleId}" default export is not a valid RuleFactory or RuleSet. ` +
						`Use defineRule() or defineRuleSet() from @maat-tools/contracts to define it.`,
				);
			}

			if (isRuleFactory(exported)) {
				const rule = exported(options);
				if (!isRule(rule)) {
					throw new Error(
						`Plugin "${ruleId}" factory did not return a valid Rule. ` +
							`Ensure the returned object has id, needs, and evaluate().`,
					);
				}

				this.kernel.registerRule(rule);
			}

			if (isRuleSet(exported)) {
				for (const factory of exported.factories) {
					this.kernel.registerRule(factory(options));
				}
			}
		}
	}

	private async registerEnrichers(maatConfig: MaatConfig) {
		for (const entry of maatConfig.enrichers ?? []) {
			if (isEnricher(entry)) {
				this.kernel.registerEnricher(entry);
				continue;
			}

			const [enricherId, options] = resolveEntry(entry as PluginEntry);
			const factory = (await import(this.resolvePlugin(enricherId))).default;

			if (!isEnricherFactory(factory)) {
				throw new Error(
					`Plugin "${enricherId}" default export is not a valid EnricherFactory. ` +
						`Use defineEnricher() from @maat-tools/contracts to define it.`,
				);
			}

			const enricher = factory(options);

			if (!isEnricher(enricher)) {
				throw new Error(
					`Plugin "${enricherId}" factory did not return a valid Enricher. ` +
						`Ensure the returned object has id, needFacts, provideFacts, and enrich().`,
				);
			}

			this.kernel.registerEnricher(enricher);
		}
	}

	private registerInsight(insight: Insight) {
		if (this.insights.some((i) => i.id === insight.id)) {
			throw new Error(`Insight with id "${insight.id}" is already registered`);
		}
		this.insights.push(insight);
	}

	private async configureInsights(maatConfig: MaatConfig) {
		for (const entry of maatConfig.insights ?? []) {
			if (isInsight(entry)) {
				this.registerInsight(entry);
				continue;
			}

			const [insightId, options] = resolveEntry(entry as PluginEntry);
			const exported = (await import(this.resolvePlugin(insightId))).default;

			if (!isInsightFactory(exported) && !isInsightSet(exported)) {
				throw new Error(
					`Plugin "${insightId}" default export is not a valid InsightFactory or InsightSet. ` +
						`Use defineInsight() or defineInsightSet() from @maat-tools/contracts to define it.`,
				);
			}
			if (isInsightSet(exported)) {
				for (const factory of exported.factories) {
					this.registerInsight(factory(options));
				}
			}

			if (isInsightFactory(exported)) {
				const insight = exported(options as Record<string, never>);

				if (!isInsight(insight)) {
					throw new Error(
						`Insight "${insightId}" factory did not return a valid Insight. ` +
							`Ensure the returned object has id, needRules, and analyze().`,
					);
				}

				this.registerInsight(insight);
			}
		}
	}

	private async configureLedger(maatConfig: MaatConfig) {
		if (!maatConfig.ledger) {
			return;
		}

		const [backendId, options] = resolveEntry(maatConfig.ledger as unknown as PluginEntry);
		const factory = (await import(this.resolvePlugin(backendId))).default;

		if (!isLedgerBackendFactory(factory)) {
			throw new Error(
				`Ledger backend "${backendId}" default export is not a valid LedgerBackendFactory. ` +
					`Use defineLedgerBackend() from @maat-tools/contracts to define it.`,
			);
		}

		this.ledger = factory(options);
		await this.ledger.initialize();
	}
}

new MaatCLI().run().catch((error) => {
	console.error(`[maat] ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
