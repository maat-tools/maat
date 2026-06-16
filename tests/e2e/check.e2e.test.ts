import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FindingStatus } from '@maat-tools/contracts';
import { generateFingerprint } from '@maat-tools/kernel';
import { LedgerHarness, runCli, scenarioResolved, scenarioUnverified, stripAnsi } from '@maat-tools/testing';

const SAMPLE_CONFIG = resolve(import.meta.dir, '../fixtures/sample-project/maat.config.ts');
const NON_STRICT_CONFIG = resolve(import.meta.dir, '../fixtures/sample-project/maat.config.nonstrict.ts');
const VERIFICATION_CONFIG = resolve(import.meta.dir, '../fixtures/verification-project/maat.config.ts');
const NO_RULES_CONFIG = resolve(import.meta.dir, '../fixtures/sample-project/maat.config.norules.ts');
const NO_COLLECTORS_CONFIG = resolve(import.meta.dir, '../fixtures/sample-project/maat.config.nocollectors.ts');
const CLEAN_CONFIG = resolve(import.meta.dir, '../fixtures/clean-project/maat.config.ts');

const TIMEOUT = 30_000;

const VERIFY_FINGERPRINT = generateFingerprint('verify-rule', { id: 'verify-finding' });

const VERIFY_FINDING = {
	ruleId: 'verify-rule',
	ruleIdentifier: { id: 'verify-finding' },
	message: 'finding that needs verification',
	artifacts: [],
};

function extractFingerprint(stdout: string): string {
	const match = stdout.match(/\b[a-f0-9]{64}\b/);
	expect(match).not.toBeNull();
	return match?.[0] as string;
}

function extractFingerprints(stdout: string): string[] {
	const matches = stdout.match(/\b[a-f0-9]{64}\b/g) ?? [];
	return [...new Set(matches)];
}

async function readLedgerEvents(ledgerPath: string): Promise<Record<string, unknown>[]> {
	const content = await readFile(ledgerPath, 'utf-8');
	if (!content.trim()) {
		return [];
	}

	return content
		.trim()
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function lastEventForFingerprint(ledgerPath: string, fingerprint: string): Promise<Record<string, unknown>> {
	const events = await readLedgerEvents(ledgerPath);
	const matches = events.filter((e) => e.fingerprint === fingerprint);
	expect(matches.length).toBeGreaterThan(0);
	return matches[matches.length - 1] as Record<string, unknown>;
}

async function getObservedEvent(ledgerPath: string, fingerprint: string): Promise<Record<string, unknown>> {
	const events = await readLedgerEvents(ledgerPath);
	const observed = events.find((e) => e.fingerprint === fingerprint && e.type === FindingStatus.OBSERVED);
	expect(observed).toBeDefined();
	return observed as Record<string, unknown>;
}

describe('maat check — core behavior', () => {
	test('exits 1 when violations are found (strict mode default)', () => {
		const result = runCli(['check'], { config: SAMPLE_CONFIG });
		expect(result.exitCode).toBe(1);
	});

	test('non-strict config → exits 0 even with violations', () => {
		const result = runCli(['check'], { config: NON_STRICT_CONFIG });
		expect(result.exitCode).toBe(0);
	});

	test('check prints findings to stdout', () => {
		const result = runCli(['check'], { config: SAMPLE_CONFIG });
		expect(result.stdout).toContain('cop-args');
		expect(result.stdout).toContain('com');
	});

	test('--ledger flag without ledger configured → exit 1 with error', () => {
		const result = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG });
		expect(result.exitCode).toBe(1);
		expect(stripAnsi(result.stderr)).toContain('Ledger option enabled');
	});

	test('--silent suppresses stdout but exit code still reflects violations', () => {
		const result = runCli(['check', '--silent'], { config: SAMPLE_CONFIG });
		expect(result.exitCode).toBe(1);
		expect(result.stdout.trim()).toBe('');
	});

	test('clean codebase without a ledger reports success on stdout', () => {
		const result = runCli(['check'], { config: CLEAN_CONFIG });
		expect(result.exitCode).toBe(0);
		expect(stripAnsi(result.stdout)).toContain('No findings detected');
	});

	test('--silent --ledger without a ledger configured still surfaces the config error', () => {
		const result = runCli(['check', '--silent', '--ledger'], { config: SAMPLE_CONFIG });
		expect(result.exitCode).toBe(1);
		expect(stripAnsi(result.stderr)).toContain('Ledger option enabled');
	});

	test('config with no collectors reports a notice instead of a silent success', () => {
		const result = runCli(['check'], { config: NO_COLLECTORS_CONFIG });
		expect(result.exitCode).toBe(1);
		expect(stripAnsi(result.stderr).toLowerCase()).toContain('no collectors');
	});

	test('config with no rules reports a notice instead of a silent success', () => {
		const result = runCli(['check'], { config: NO_RULES_CONFIG });
		expect(result.exitCode).toBe(1);
		expect(stripAnsi(result.stderr).toLowerCase()).toContain('no rules');
	});
});

describe('maat check — ledger state transitions', () => {
	const ledger = new LedgerHarness();

	beforeEach(async () => await ledger.setup());
	afterEach(async () => await ledger.teardown());

	test(
		'first check --ledger seeds observed events',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const result = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);

			const events = await readLedgerEvents(ledger.path);
			expect(events.some((e) => e.type === FindingStatus.OBSERVED)).toBe(true);
		},
		TIMEOUT,
	);

	test(
		'second check --ledger is idempotent (no duplicate events)',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			const eventsAfterFirst = await readLedgerEvents(ledger.path);
			expect(eventsAfterFirst.length).toBeGreaterThan(0);

			runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			const eventsAfterSecond = await readLedgerEvents(ledger.path);

			expect(eventsAfterSecond.length).toBe(eventsAfterFirst.length);
		},
		TIMEOUT,
	);

	test(
		'third check --ledger still does not add events',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			const eventsAfterSecond = await readLedgerEvents(ledger.path);

			runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			const eventsAfterThird = await readLedgerEvents(ledger.path);

			expect(eventsAfterThird.length).toBe(eventsAfterSecond.length);
		},
		TIMEOUT,
	);

	test(
		'OBSERVED finding that disappears is auto-resolved',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = generateFingerprint('phantom-rule', { id: 'phantom' });
			await ledger.backend.append({
				type: FindingStatus.OBSERVED,
				timestamp: new Date().toISOString(),
				fingerprint,
				ruleId: 'phantom-rule',
				instanceId: 'phantom-rule',
				message: 'phantom finding',
				artifacts: [],
			});

			runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });

			const event = await lastEventForFingerprint(ledger.path, fingerprint);
			expect(event.type).toBe(FindingStatus.RESOLVED);
		},
		TIMEOUT,
	);

	test(
		'RESOLVED finding that reappears is a regression',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const check1 = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			const fingerprint = extractFingerprint(check1.stdout);
			const observed = await getObservedEvent(ledger.path, fingerprint);

			runCli(['resolve', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });

			const check2 = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			expect(check2.exitCode).toBe(1);
			const plain = stripAnsi(check2.stderr);
			expect(plain).toContain('regression');
			expect(plain).toContain(fingerprint);
			expect(plain).toContain(String(observed.message));
		},
		TIMEOUT,
	);

	test(
		'regression message includes the resolution reason when available',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const check1 = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			const fingerprint = extractFingerprint(check1.stdout);
			const observed = await getObservedEvent(ledger.path, fingerprint);

			runCli(['resolve', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			await ledger.backend.append({
				type: FindingStatus.RESOLVED,
				timestamp: new Date().toISOString(),
				fingerprint,
				ruleId: String(observed.ruleId),
				instanceId: String(observed.instanceId),
				message: String(observed.message),
				artifacts: Array.isArray(observed.artifacts) ? observed.artifacts : [],
				reason: 'fixed in previous refactor',
			});

			const check2 = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			expect(check2.exitCode).toBe(1);
			const plain = stripAnsi(check2.stderr);
			expect(plain).toContain('regression');
			expect(plain).toContain(fingerprint);
			expect(plain).toContain('fixed in previous refactor');
		},
		TIMEOUT,
	);

	test(
		'multiple resolved findings that reappear list every fingerprint',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const check1 = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			const fingerprints = extractFingerprints(check1.stdout).slice(0, 2);
			expect(fingerprints.length).toBeGreaterThanOrEqual(2);

			for (const fingerprint of fingerprints) {
				runCli(['resolve', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });
			}

			const check2 = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			expect(check2.exitCode).toBe(1);
			const plain = stripAnsi(check2.stderr);
			for (const fingerprint of fingerprints) {
				expect(plain).toContain(fingerprint);
			}
		},
		TIMEOUT,
	);

	test(
		'active baseline hides findings and exits 0',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });

			const base = runCli(['baseline'], { config: SAMPLE_CONFIG, env });
			expect(base.exitCode).toBe(0);

			const check = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			expect(check.exitCode).toBe(0);
		},
		TIMEOUT,
	);

	test(
		'expired baseline → check exits 1 with expired warning',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };

			runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			runCli(['baseline', '--expires-in', '1'], { config: SAMPLE_CONFIG, env });

			const content = await readFile(ledger.path, 'utf-8');
			const entries = content
				.trim()
				.split('\n')
				.filter(Boolean)
				.map((line) => JSON.parse(line) as Record<string, unknown>);

			const baselined = entries.filter((e) => e.type === FindingStatus.BASELINED);
			expect(baselined.length).toBeGreaterThan(0);

			const expiredAt = new Date(Date.now() - 1000).toISOString();
			const expiredLines = entries.map((e) => {
				if (e.type === FindingStatus.BASELINED) {
					return JSON.stringify({ ...e, expiresAt: expiredAt });
				}
				return JSON.stringify(e);
			});
			await writeFile(ledger.path, `${expiredLines.join('\n')}\n`, 'utf-8');

			const check = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			expect(check.exitCode).toBe(1);
			const plain = stripAnsi(check.stderr);
			expect(plain).toContain('expired');
			for (const entry of baselined) {
				expect(plain).toContain(String(entry.fingerprint));
				expect(plain).toContain(String(entry.message));
			}
			expect(plain).toContain(expiredAt.slice(0, 10));
		},
		TIMEOUT,
	);

	test(
		'expired baseline for a finding that is no longer present is auto-resolved',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = generateFingerprint('phantom-rule', { id: 'phantom-baselined' });
			const message = 'phantom baselined finding';
			const expiresAt = new Date(Date.now() - 1000).toISOString();
			await ledger.backend.append({
				type: FindingStatus.BASELINED,
				timestamp: new Date().toISOString(),
				fingerprint,
				ruleId: 'phantom-rule',
				instanceId: 'phantom-rule',
				message,
				artifacts: [],
				expiresAt,
			});

			const check = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			expect(check.exitCode).toBe(1);

			const plain = stripAnsi(check.stderr);
			expect(plain).toContain('expired');
			expect(plain).toContain(fingerprint);
			expect(plain).toContain(message);
			expect(plain).toContain(expiresAt.slice(0, 10));

			const event = await lastEventForFingerprint(ledger.path, fingerprint);
			expect(event.type).toBe(FindingStatus.RESOLVED);
		},
		TIMEOUT,
	);

	test(
		'revoked finding that reappears is hidden from output',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const check1 = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			const fingerprint = extractFingerprint(check1.stdout);

			const observed = await getObservedEvent(ledger.path, fingerprint);
			await ledger.backend.append({
				type: FindingStatus.REVOKED,
				timestamp: new Date().toISOString(),
				fingerprint,
				ruleId: String(observed.ruleId),
				instanceId: String(observed.instanceId),
				message: String(observed.message),
				artifacts: Array.isArray(observed.artifacts) ? observed.artifacts : [],
			});

			const check2 = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			expect(check2.stdout).not.toContain(fingerprint);
		},
		TIMEOUT,
	);

	test(
		'regression re-observes the finding so it is not locked in RESOLVED',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const check1 = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			const fingerprint = extractFingerprint(check1.stdout);

			runCli(['resolve', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });

			const check2 = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			expect(check2.exitCode).toBe(1);

			// A regression must be written back as OBSERVED so the finding can be
			// re-baselined/resolved later instead of being stuck as RESOLVED forever.
			const event = await lastEventForFingerprint(ledger.path, fingerprint);
			expect(event.type).toBe(FindingStatus.OBSERVED);
		},
		TIMEOUT,
	);

	test(
		'active baseline whose finding disappeared is auto-resolved before expiry',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const fingerprint = generateFingerprint('phantom-rule', { id: 'phantom-active-baseline' });
			await ledger.backend.append({
				type: FindingStatus.BASELINED,
				timestamp: new Date().toISOString(),
				fingerprint,
				ruleId: 'phantom-rule',
				instanceId: 'phantom-rule',
				message: 'phantom active baseline',
				artifacts: [],
				expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
			});

			runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });

			const event = await lastEventForFingerprint(ledger.path, fingerprint);
			expect(event.type).toBe(FindingStatus.RESOLVED);
		},
		TIMEOUT,
	);

	test(
		'first check --ledger guides the user to baseline, not only failing',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const result = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			const output = stripAnsi(`${result.stdout}${result.stderr}`).toLowerCase();
			expect(output).toContain('maat baseline');
		},
		TIMEOUT,
	);
});

describe('maat check — requiresVerification transitions', () => {
	const ledger = new LedgerHarness();

	beforeEach(async () => await ledger.setup());
	afterEach(async () => await ledger.teardown());

	function env() {
		return { MAAT_TEST_LEDGER: ledger.path };
	}

	test(
		'new finding that requires verification is stored as UNVERIFIED',
		async () => {
			const result = runCli(['check', '--ledger'], { config: VERIFICATION_CONFIG, env: env() });
			expect(result.exitCode).toBe(0);
			expect(stripAnsi(result.stdout)).toContain('[Verify]');

			const event = await lastEventForFingerprint(ledger.path, VERIFY_FINGERPRINT);
			expect(event.type).toBe(FindingStatus.UNVERIFIED);
		},
		TIMEOUT,
	);

	test(
		'repeated check --ledger for unverified finding is idempotent',
		async () => {
			runCli(['check', '--ledger'], { config: VERIFICATION_CONFIG, env: env() });
			const eventsAfterFirst = await readLedgerEvents(ledger.path);
			expect(eventsAfterFirst.length).toBe(1);

			runCli(['check', '--ledger'], { config: VERIFICATION_CONFIG, env: env() });
			const eventsAfterSecond = await readLedgerEvents(ledger.path);

			expect(eventsAfterSecond.length).toBe(eventsAfterFirst.length);
		},
		TIMEOUT,
	);

	test(
		'UNVERIFIED finding that still requires verification stays UNVERIFIED',
		async () => {
			await scenarioUnverified(ledger, VERIFY_FINDING);
			const eventsBefore = await readLedgerEvents(ledger.path);

			const result = runCli(['check', '--ledger'], { config: VERIFICATION_CONFIG, env: env() });
			expect(result.exitCode).toBe(0);

			const eventsAfter = await readLedgerEvents(ledger.path);
			expect(eventsAfter.length).toBe(eventsBefore.length);

			const event = await lastEventForFingerprint(ledger.path, VERIFY_FINGERPRINT);
			expect(event.type).toBe(FindingStatus.UNVERIFIED);
		},
		TIMEOUT,
	);

	test(
		'UNVERIFIED finding that disappears is auto-resolved',
		async () => {
			await scenarioUnverified(ledger, VERIFY_FINDING);

			// Run check against a project that does not produce the verification finding.
			runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env: env() });

			const event = await lastEventForFingerprint(ledger.path, VERIFY_FINGERPRINT);
			expect(event.type).toBe(FindingStatus.RESOLVED);
		},
		TIMEOUT,
	);

	test(
		'RESOLVED finding that reappears as requiring verification is a regression to verify',
		async () => {
			const fingerprint = await scenarioResolved(ledger, VERIFY_FINDING);

			const result = runCli(['check', '--ledger'], { config: VERIFICATION_CONFIG, env: env() });
			expect(result.exitCode).toBe(1);
			const plain = stripAnsi(result.stderr);
			expect(plain).toContain('regression to verify');
			expect(plain).toContain(fingerprint);
			expect(plain).toContain(VERIFY_FINDING.message);
		},
		TIMEOUT,
	);
});

describe('maat check — promise violations break even in non-strict mode', () => {
	const ledger = new LedgerHarness();

	beforeEach(async () => await ledger.setup());
	afterEach(async () => await ledger.teardown());

	test(
		'non-strict + --ledger + regression → exits 1',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const check1 = runCli(['check', '--ledger'], { config: NON_STRICT_CONFIG, env });
			const fingerprint = extractFingerprint(check1.stdout);

			runCli(['resolve', '--fingerprint', fingerprint], { config: NON_STRICT_CONFIG, env });

			const check2 = runCli(['check', '--ledger'], { config: NON_STRICT_CONFIG, env });
			expect(check2.exitCode).toBe(1);
			expect(stripAnsi(check2.stderr)).toContain('regression');
		},
		TIMEOUT,
	);

	test(
		'non-strict + --ledger + expired baseline → exits 1',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			runCli(['check', '--ledger'], { config: NON_STRICT_CONFIG, env });
			runCli(['baseline', '--expires-in', '1'], { config: NON_STRICT_CONFIG, env });

			const content = await readFile(ledger.path, 'utf-8');
			const entries = content
				.trim()
				.split('\n')
				.filter(Boolean)
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			const expiredLines = entries.map((e) =>
				e.type === FindingStatus.BASELINED
					? JSON.stringify({ ...e, expiresAt: new Date(Date.now() - 1000).toISOString() })
					: JSON.stringify(e),
			);
			await writeFile(ledger.path, `${expiredLines.join('\n')}\n`, 'utf-8');

			const check = runCli(['check', '--ledger'], { config: NON_STRICT_CONFIG, env });
			expect(check.exitCode).toBe(1);
			expect(stripAnsi(check.stderr)).toContain('expired');
		},
		TIMEOUT,
	);
});

describe('maat check — reconciles against a configured ledger without --ledger', () => {
	const ledger = new LedgerHarness();

	beforeEach(async () => await ledger.setup());
	afterEach(async () => await ledger.teardown());

	test(
		'plain check hides baselined findings and exits 0 when a ledger is configured',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			runCli(['baseline'], { config: SAMPLE_CONFIG, env });

			const result = runCli(['check'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(0);
			expect(result.stdout).not.toContain('cop-args');
		},
		TIMEOUT,
	);

	test(
		'plain check reconciles read-only and writes no events',
		async () => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			const before = await readLedgerEvents(ledger.path);
			expect(before.length).toBeGreaterThan(0);

			runCli(['check'], { config: SAMPLE_CONFIG, env });
			const after = await readLedgerEvents(ledger.path);

			expect(after.length).toBe(before.length);
		},
		TIMEOUT,
	);

	test(
		'plain check reports a regression detected via the ledger',
		() => {
			const env = { MAAT_TEST_LEDGER: ledger.path };
			const check1 = runCli(['check', '--ledger'], { config: SAMPLE_CONFIG, env });
			const fingerprint = extractFingerprint(check1.stdout);

			runCli(['resolve', '--fingerprint', fingerprint], { config: SAMPLE_CONFIG, env });

			const result = runCli(['check'], { config: SAMPLE_CONFIG, env });
			expect(result.exitCode).toBe(1);
			expect(stripAnsi(result.stderr)).toContain('regression');
		},
		TIMEOUT,
	);
});
