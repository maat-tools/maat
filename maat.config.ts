import { defineConfig, rule } from './packages/core/src';
import { layer } from './packages/coupling-rules/src/layer';

export default defineConfig({
	check: { strict: true },
	collectors: [
		[
			'@maat-tools/collector-ts',
			{
				tsConfigFilePath: './tsconfig.json',
				exclude: [
					'**/node_modules/**',
					'**/.maat/**',
					'**/dist/**',
					'**/*.test.ts',
					'**/fixtures/**',
					'maat.config.ts',
				],
			},
		],
	],
	rules: [
		rule('@maat-tools/connascence-rules/cop-args', {
			flagBoolean: true,
			maxArgumentsAllowed: 3,
		}),

		rule('@maat-tools/connascence-rules/cop-struct'),

		layer('@maat-tools/contracts').allows('node:crypto').build(),
		layer('@maat-tools/vocabulary').allows('@maat-tools/contracts', 'node:crypto').build(),
		layer('@maat-tools/kernel').allows('@maat-tools/contracts', 'node:crypto').build(),

		layer('@maat-tools/core').allows('@maat-tools/contracts', 'node:crypto', 'ulid', 'node:util').build(),
	],
	ledger: ['@maat-tools/file-ledger', { path: './.maat/maat-ledger.ndjson' }],
});
