import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Finding, Rule } from '@maat-tools/contracts';
import { StdoutPresenter } from './stdout';

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escape codes
const ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(s: string): string {
	return s.replace(ANSI_RE, '');
}

function makeFinding(overrides: Partial<Finding> & Pick<Finding, 'ruleId' | 'fingerprint'>): Finding {
	return {
		instanceId: overrides.instanceId ?? overrides.ruleId,
		message: overrides.message ?? `message for ${overrides.fingerprint}`,
		artifacts: overrides.artifacts ?? [],
		requiresVerification: overrides.requiresVerification ?? false,
		...overrides,
	};
}

function makeRule(id: string): Rule {
	return {
		instanceId: id,
		id,
		needFacts: [],
		evaluate: () => [],
		describeArtifact: (artifact) => ({ [artifact.kind]: String(artifact.data) }),
	};
}

describe('StdoutPresenter.findingGroup', () => {
	let writes: string[];
	let originalWrite: typeof process.stdout.write;

	beforeEach(() => {
		writes = [];
		originalWrite = process.stdout.write;
		process.stdout.write = ((chunk: string | Uint8Array) => {
			writes.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
			return true;
		}) as typeof process.stdout.write;
	});

	afterEach(() => {
		process.stdout.write = originalWrite;
	});

	function output(): string {
		return stripAnsi(writes.join(''));
	}

	test('groups findings with same fingerprint under one fingerprint line', () => {
		const presenter = new StdoutPresenter();
		const rule = makeRule('rule-a');
		const findings = [
			makeFinding({
				ruleId: 'rule-a',
				fingerprint: 'fp1',
				message: 'depends on "mongodb"',
				artifacts: [{ kind: 'file', data: 'src/a.ts:1:0' }],
			}),
			makeFinding({
				ruleId: 'rule-a',
				fingerprint: 'fp1',
				message: 'depends on "mongodb"',
				artifacts: [{ kind: 'file', data: 'src/b.ts:2:0' }],
			}),
			makeFinding({
				ruleId: 'rule-a',
				fingerprint: 'fp1',
				message: 'depends on "mongodb"',
				artifacts: [{ kind: 'file', data: 'src/c.ts:3:0' }],
			}),
		];

		presenter.findingGroup(findings, () => rule);

		const text = output();
		const fingerprintMatches = text.match(/fp1/g);
		expect(fingerprintMatches).toHaveLength(1);
		expect(text).toContain('src/a.ts:1:0');
		expect(text).toContain('src/b.ts:2:0');
		expect(text).toContain('src/c.ts:3:0');
	});

	test('shows unique fingerprint count per rule, not total findings', () => {
		const presenter = new StdoutPresenter();
		const rule = makeRule('rule-a');
		const findings = [
			makeFinding({ ruleId: 'rule-a', fingerprint: 'fp1', artifacts: [{ kind: 'file', data: 'a.ts' }] }),
			makeFinding({ ruleId: 'rule-a', fingerprint: 'fp1', artifacts: [{ kind: 'file', data: 'b.ts' }] }),
			makeFinding({ ruleId: 'rule-a', fingerprint: 'fp2', artifacts: [{ kind: 'file', data: 'c.ts' }] }),
		];

		presenter.findingGroup(findings, () => rule);

		const text = output();
		expect(text).toContain('2 finding(s)');
	});

	test('separates findings with different fingerprints under the same rule', () => {
		const presenter = new StdoutPresenter();
		const rule = makeRule('rule-a');
		const findings = [
			makeFinding({
				ruleId: 'rule-a',
				fingerprint: 'fp1',
				message: 'depends on "mongodb"',
				artifacts: [{ kind: 'file', data: 'a.ts' }],
			}),
			makeFinding({
				ruleId: 'rule-a',
				fingerprint: 'fp2',
				message: 'depends on "node-rsa"',
				artifacts: [{ kind: 'file', data: 'b.ts' }],
			}),
		];

		presenter.findingGroup(findings, () => rule);

		const text = output();
		expect(text).toContain('fp1');
		expect(text).toContain('fp2');
		expect(text).toContain('depends on "mongodb"');
		expect(text).toContain('depends on "node-rsa"');
	});

	test('separates findings from different rules into separate rule groups', () => {
		const presenter = new StdoutPresenter();
		const ruleA = makeRule('rule-a');
		const ruleB = makeRule('rule-b');
		const findings = [
			makeFinding({
				ruleId: 'rule-a',
				fingerprint: 'fp1',
				message: 'rule-a msg',
				artifacts: [{ kind: 'file', data: 'a.ts' }],
			}),
			makeFinding({
				ruleId: 'rule-b',
				fingerprint: 'fp2',
				message: 'rule-b msg',
				artifacts: [{ kind: 'file', data: 'b.ts' }],
			}),
		];

		presenter.findingGroup(findings, (id) => (id === 'rule-a' ? ruleA : ruleB));

		const text = output();
		expect(text).toContain('[rule-a]');
		expect(text).toContain('[rule-b]');
		expect(text).toContain('rule-a msg');
		expect(text).toContain('rule-b msg');
	});

	test('shows [Verify] badge when any finding in fingerprint group requires verification', () => {
		const presenter = new StdoutPresenter();
		const rule = makeRule('rule-a');
		const findings = [
			makeFinding({
				ruleId: 'rule-a',
				fingerprint: 'fp1',
				message: 'needs verify',
				artifacts: [{ kind: 'file', data: 'a.ts' }],
				requiresVerification: false,
			}),
			makeFinding({
				ruleId: 'rule-a',
				fingerprint: 'fp1',
				message: 'needs verify',
				artifacts: [{ kind: 'file', data: 'b.ts' }],
				requiresVerification: true,
			}),
		];

		presenter.findingGroup(findings, () => rule);

		const text = output();
		expect(text).toContain('[Verify]');
	});

	test('does not show [Verify] badge when no finding requires verification', () => {
		const presenter = new StdoutPresenter();
		const rule = makeRule('rule-a');
		const findings = [
			makeFinding({
				ruleId: 'rule-a',
				fingerprint: 'fp1',
				message: 'no verify',
				artifacts: [{ kind: 'file', data: 'a.ts' }],
				requiresVerification: false,
			}),
		];

		presenter.findingGroup(findings, () => rule);

		const text = output();
		expect(text).not.toContain('[Verify]');
	});

	test('uses rule.describeArtifact to format artifacts', () => {
		const presenter = new StdoutPresenter();
		const rule: Rule = {
			...makeRule('rule-a'),
			describeArtifact: (artifact) => ({
				file: String(artifact.data),
				dependency: 'mongodb',
			}),
		};
		const findings = [
			makeFinding({
				ruleId: 'rule-a',
				fingerprint: 'fp1',
				artifacts: [{ kind: 'import', data: 'src/a.ts:2:58' }],
			}),
		];

		presenter.findingGroup(findings, () => rule);

		const text = output();
		expect(text).toContain('file: src/a.ts:2:58');
		expect(text).toContain('dependency: mongodb');
	});

	test('falls back to default artifact format when rule is undefined', () => {
		const presenter = new StdoutPresenter();
		const findings = [
			makeFinding({
				ruleId: 'unknown-rule',
				fingerprint: 'fp1',
				artifacts: [{ kind: 'file', data: 'src/a.ts' }],
			}),
		];

		presenter.findingGroup(findings, () => undefined);

		const text = output();
		expect(text).toContain('file: src/a.ts');
	});

	test('produces no output when findings array is empty', () => {
		const presenter = new StdoutPresenter();

		presenter.findingGroup([], () => undefined);

		expect(writes).toHaveLength(0);
	});

	test('produces no output when presenter is silent', () => {
		const presenter = new StdoutPresenter({ silent: true });
		const findings = [
			makeFinding({
				ruleId: 'rule-a',
				fingerprint: 'fp1',
				artifacts: [{ kind: 'file', data: 'a.ts' }],
			}),
		];

		presenter.findingGroup(findings, () => undefined);

		expect(writes).toHaveLength(0);
	});

	test('prints the arrow prefix for each artifact', () => {
		const presenter = new StdoutPresenter();
		const rule = makeRule('rule-a');
		const findings = [
			makeFinding({
				ruleId: 'rule-a',
				fingerprint: 'fp1',
				artifacts: [{ kind: 'file', data: 'a.ts' }],
			}),
		];

		presenter.findingGroup(findings, () => rule);

		const text = output();
		expect(text).toContain('↳');
	});

	test('handles findings with multiple artifacts in a single finding', () => {
		const presenter = new StdoutPresenter();
		const rule = makeRule('rule-a');
		const findings = [
			makeFinding({
				ruleId: 'rule-a',
				fingerprint: 'fp1',
				artifacts: [
					{ kind: 'file', data: 'a.ts' },
					{ kind: 'dependency', data: 'mongodb' },
				],
			}),
		];

		presenter.findingGroup(findings, () => rule);

		const text = output();
		expect(text).toContain('file: a.ts');
		expect(text).toContain('dependency: mongodb');
	});

	test('handles many findings sharing the same fingerprint (deduplication scenario)', () => {
		const presenter = new StdoutPresenter();
		const rule = makeRule('coupling-rules/layer-imports');
		const findings = Array.from({ length: 50 }, (_, i) =>
			makeFinding({
				ruleId: 'coupling-rules/layer-imports',
				fingerprint: 'e9ce784',
				message: '"@rocket.chat/model-typings" depends on "mongodb"',
				artifacts: [{ kind: 'file', data: `packages/model-typings/src/models/IModel${i}.ts:2:65` }],
			}),
		);

		presenter.findingGroup(findings, () => rule);

		const text = output();
		expect(text).toContain('1 finding(s)');
		const fingerprintMatches = text.match(/e9ce784/g);
		expect(fingerprintMatches).toHaveLength(1);
		for (let i = 0; i < 50; i++) {
			expect(text).toContain(`IModel${i}.ts:2:65`);
		}
	});
});

describe('StdoutPresenter.findings', () => {
	let writes: string[];
	let originalWrite: typeof process.stdout.write;

	beforeEach(() => {
		writes = [];
		originalWrite = process.stdout.write;
		process.stdout.write = ((chunk: string | Uint8Array) => {
			writes.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
			return true;
		}) as typeof process.stdout.write;
	});

	afterEach(() => {
		process.stdout.write = originalWrite;
	});

	function output(): string {
		return stripAnsi(writes.join(''));
	}

	test('prints section header with total finding count', () => {
		const presenter = new StdoutPresenter();
		const findings = [
			makeFinding({ ruleId: 'rule-a', fingerprint: 'fp1', artifacts: [{ kind: 'file', data: 'a.ts' }] }),
			makeFinding({ ruleId: 'rule-a', fingerprint: 'fp2', artifacts: [{ kind: 'file', data: 'b.ts' }] }),
		];

		presenter.findings(findings, () => makeRule('rule-a'));

		const text = output();
		expect(text).toContain('FINDINGS (2)');
	});

	test('produces no output when findings array is empty', () => {
		const presenter = new StdoutPresenter();

		presenter.findings([], () => undefined);

		expect(writes).toHaveLength(0);
	});

	test('produces no output when silent', () => {
		const presenter = new StdoutPresenter({ silent: true });
		const findings = [
			makeFinding({ ruleId: 'rule-a', fingerprint: 'fp1', artifacts: [{ kind: 'file', data: 'a.ts' }] }),
		];

		presenter.findings(findings, () => undefined);

		expect(writes).toHaveLength(0);
	});
});
