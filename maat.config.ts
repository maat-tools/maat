import { defineConfig } from './packages/core/src';
import { layer } from './packages/coupling-rules/src/layer';
import { Pure } from './packages/coupling-rules/src/roles';

export default defineConfig({
	collectors: [
		[
			'@maat/collector-ts',
			{
				tsConfigFilePath: './tsconfig.json',
			},
		],
	],
	rules: [
		layer('@maat/contracts').is(Pure).allows(),
		layer('@maat/vocabulary').is(Pure).allows('@maat/contracts'),
		layer('@maat/core').is(Pure).allows('@maat/contracts'),
		layer('@maat/kernel').is(Pure).allows('@maat/contracts'),
		layer('@maat/coupling-rules')
			.is(Pure)
			.allows('@maat/contracts', '@maat/vocabulary'),
		layer('@maat/connascence-rules')
			.is(Pure)
			.allows('@maat/contracts', '@maat/vocabulary', '@maat/core'),
	],
	ledger: ['@maat/file-ledger', { path: './maat-ledger.ndjson' }],
});
