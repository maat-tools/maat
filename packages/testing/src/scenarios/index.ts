import type { FindingRuleOutput } from '@maat-tools/contracts';
import { FindingStatus, generateFingerprint } from '@maat-tools/contracts';
import type { LedgerHarness } from '../harness/ledger';

export async function scenarioObserved(
	harness: LedgerHarness,
	output: FindingRuleOutput,
	instanceId?: string,
): Promise<string> {
	const fingerprint = generateFingerprint(output.ruleId, output.ruleIdentifier);
	await harness.backend.append({
		type: FindingStatus.OBSERVED,
		timestamp: new Date().toISOString(),
		fingerprint,
		rule_id: output.ruleId,
		instance_id: instanceId ?? output.ruleId,
		message: output.message,
		artifacts: output.artifacts,
	});
	return fingerprint;
}

export async function scenarioBaselined(
	harness: LedgerHarness,
	output: FindingRuleOutput,
	daysFromNow = 30,
): Promise<string> {
	const fingerprint = await scenarioObserved(harness, output);
	const expiresAt = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
	await harness.backend.append({
		type: FindingStatus.BASELINED,
		timestamp: new Date().toISOString(),
		fingerprint,
		expires_at: expiresAt,
	});
	return fingerprint;
}

export async function scenarioResolved(harness: LedgerHarness, output: FindingRuleOutput): Promise<string> {
	const fingerprint = await scenarioObserved(harness, output);
	await harness.backend.append({
		type: FindingStatus.RESOLVED,
		timestamp: new Date().toISOString(),
		fingerprint,
	});
	return fingerprint;
}

export async function scenarioVerified(
	harness: LedgerHarness,
	output: FindingRuleOutput,
	reason?: string,
): Promise<string> {
	const fingerprint = await scenarioObserved(harness, output);
	await harness.backend.append({
		type: FindingStatus.VERIFIED,
		timestamp: new Date().toISOString(),
		fingerprint,
		...(reason !== undefined ? { reason } : {}),
	});
	return fingerprint;
}
