import { defineConfig, rule } from './packages/core/src';
import { layer } from './packages/coupling-rules/src/layer';
import { Pure } from './packages/coupling-rules/src/roles';

export default defineConfig({
	check: { strict: true },
	collectors: [
		[
			'@maat-tools/collector-ts',
			{
				tsConfigFilePath: './tsconfig.json',
				exclude: ['**/node_modules/**', '**/.maat/**', '**/dist/**', '**/*.test.ts', '**/fixtures/**'],
			},
		],
	],
	rules: [
		rule('@maat-tools/connascence-rules/cop', {
			flagBoolean: true,
			maxArgumentsAllowed: 3,
		}),

		layer('@maat-tools/contracts').is(Pure).allows('node:crypto'),
		layer('@maat-tools/vocabulary').is(Pure).allows('@maat-tools/contracts', 'node:crypto'),
		layer('@maat-tools/kernel').is(Pure).allows('@maat-tools/contracts', 'node:crypto'),

		layer('@maat-tools/core').is(Pure).allows('@maat-tools/contracts', 'node:crypto', 'ulid'),

		layer('@maat-tools/coupling-rules').allows('@maat-tools/contracts', '@maat-tools/vocabulary', 'node:path'),
		layer('@maat-tools/connascence-rules').allows(
			'@maat-tools/contracts',
			'@maat-tools/vocabulary',
			'@maat-tools/core',
		),
	],
	ledger: ['@maat-tools/file-ledger', { path: './.maat/maat-ledger.ndjson' }],
});
