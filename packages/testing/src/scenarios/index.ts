import type { RuleOutput } from '@maat-tools/contracts';
import { FindingStatus, generateFingerprint } from '@maat-tools/contracts';
import type { LedgerHarness } from '../harness/ledger';

export async function scenarioObserved(
	harness: LedgerHarness,
	output: RuleOutput,
	instanceId?: string,
): Promise<string> {
	const fingerprint = generateFingerprint(output.ruleId, output.ruleIdentifier);
	await harness.backend.append({
		type: FindingStatus.OBSERVED,
		timestamp: new Date().toISOString(),
		fingerprint,
		ruleId: output.ruleId,
		instanceId: instanceId ?? output.ruleId,
		message: output.message,
		artifacts: output.artifacts,
	});
	return fingerprint;
}

export async function scenarioBaselined(harness: LedgerHarness, output: RuleOutput, daysFromNow = 30): Promise<string> {
	const fingerprint = await scenarioObserved(harness, output);
	const expiresAt = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
	await harness.backend.append({
		type: FindingStatus.BASELINED,
		timestamp: new Date().toISOString(),
		fingerprint,
		ruleId: output.ruleId,
		instanceId: output.ruleId,
		message: output.message,
		artifacts: output.artifacts,
		expiresAt: expiresAt,
	});
	return fingerprint;
}

export async function scenarioResolved(harness: LedgerHarness, output: RuleOutput): Promise<string> {
	const fingerprint = await scenarioObserved(harness, output);
	await harness.backend.append({
		type: FindingStatus.RESOLVED,
		timestamp: new Date().toISOString(),
		fingerprint,
		ruleId: output.ruleId,
		instanceId: output.ruleId,
		message: output.message,
		artifacts: output.artifacts,
	});
	return fingerprint;
}

export async function scenarioUnverified(harness: LedgerHarness, output: RuleOutput, reason?: string): Promise<string> {
	const fingerprint = generateFingerprint(output.ruleId, output.ruleIdentifier);
	await harness.backend.append({
		type: FindingStatus.UNVERIFIED,
		timestamp: new Date().toISOString(),
		fingerprint,
		ruleId: output.ruleId,
		instanceId: output.ruleId,
		message: output.message,
		artifacts: output.artifacts,
		requiresVerification: true,
		...(reason !== undefined ? { reason } : {}),
	});
	return fingerprint;
}
