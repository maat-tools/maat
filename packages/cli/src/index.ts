#!/usr/bin/env bun

import {
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
	type Insight,
	type LedgerBackend,
} from '@maat/contracts';
import { defineConfig } from '@maat/core';
import { layer, Pure } from '@maat/coupling-rules';
import { Kernel } from '@maat/kernel';
import { Command } from 'commander';
import type { MaatCommand } from './commands';
import { Check } from './commands/check';
import { Axiom } from './commands/axiom';
import { Baseline } from './commands/baseline';
import { Promote } from './commands/promote';
import { Resolve } from './commands/resolve';
import { Visualize } from './commands/visualize';

const maatConfig = defineConfig({
	collectors: [
		[
			'@maat/collector-ts',
			{
				tsConfigFilePath:
					'./packages/collector-ts/fixtures/sample-project/tsconfig.json',
			},
		],
	],
	rules: [
		['@maat/connascence-rules', {}],
		layer('@maat/contracts').is(Pure).allows(),
		layer('@maat/vocabulary').is(Pure).allows('@maat/contracts'),
		layer('@maat/core').is(Pure).allows('@maat/contracts'),
		layer('@maat/kernel').is(Pure).allows('@maat/contracts', '@maat/core'),
		layer('@maat/coupling-rules').is(Pure).allows('@maat/contracts', '@maat/vocabulary'),
		layer('@maat/connascence-rules').is(Pure).allows('@maat/contracts', '@maat/vocabulary', '@maat/core'),
	],
	ledger: ['@maat/file-ledger', { path: './maat-ledger.ndjson' }],
});

class MaatCLI {
	private program: Command = new Command();
	private kernel: Kernel = new Kernel();
	private ledger: LedgerBackend | null = null;
	private insights: Insight[] = [];

	constructor() {
		this.registerCLIInfo();
	}

	public async run() {
		await this.configureKernel();
		await this.configureInsights();
		await this.configureLedger();
		this.registerCommands();
		this.program.parse();
	}

	private registerCommands() {
		if (!this.ledger) {
			console.warn(
				'No ledger configured. Commands that produce findings will not be registered.',
			);
		}
		const config = { ...maatConfig, check: { strict: true } };
		const commands: MaatCommand[] = [
			new Check(this.program, config, this.kernel, this.ledger, this.insights),
			new Axiom(this.program, config, this.kernel, this.ledger, this.insights),
			new Baseline(this.program, config, this.kernel, this.ledger, this.insights),
			new Promote(this.program, config, this.kernel, this.ledger, this.insights),
			new Resolve(this.program, config, this.kernel, this.ledger, this.insights),
			new Visualize(this.program, config, this.kernel, this.ledger, this.insights),
		];

		for (const command of commands) {
			command.register();
		}
	}

	private registerCLIInfo() {
		this.program.name('maat').description('maat cli').version('0.0.1');
	}

	private async configureInsights() {
		for (const insightEntry of maatConfig.insights ?? []) {
			const [insightId, options] =
				typeof insightEntry === 'string'
					? [insightEntry, {}]
					: insightEntry;

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

	private async configureLedger() {
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

	private async configureKernel() {
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

new MaatCLI().run();
