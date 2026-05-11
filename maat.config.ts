import { defineConfig } from './packages/core/src';
import { layer } from './packages/coupling-rules/src/layer';
import { Pure } from './packages/coupling-rules/src/roles';

export default defineConfig({
	check: { strict: true },
	collectors: [
		[
			'@maat-tools/collector-ts',
			{
				tsConfigFilePath: './tsconfig.json',
			},
		],
		['@maat-tools/collector-git', { sinceDays: 90 }],
	],
	rules: [
		[
			'@maat-tools/git-rules/churn',
			{
				threshold: 5,
				windowDays: 60,
				exclude: [
					'**/index.ts',
					'**/*.test.ts',
					'**/*.json',
					'**/*.md',
					'**/*.yml',
					'**/.github/**',
					'**/*.lock',
					'**/*.ndjson',
					'.gitignore',
				],
			},
		],
		layer('@maat-tools/contracts').is(Pure).allows('node:crypto'),
		layer('@maat-tools/vocabulary').is(Pure).allows('@maat-tools/contracts'),
		layer('@maat-tools/core').is(Pure).allows('@maat-tools/contracts', 'node:crypto', 'ulid'),
		layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts'),
		layer('@maat-tools/coupling-rules').is(Pure).allows('@maat-tools/contracts', '@maat-tools/vocabulary', 'node:path'),
		layer('@maat-tools/connascence-rules')
			.is(Pure)
			.allows('@maat-tools/contracts', '@maat-tools/vocabulary', '@maat-tools/core'),
	],
	ledger: ['@maat-tools/file-ledger', { path: './maat-ledger.ndjson' }],
	insights: [
		['@maat-tools/insights/erosion', { packageDir: 'packages/', packagePrefix: '@maat-tools/' }],
	],
});
