import { createHash } from 'node:crypto';

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') {
		return JSON.stringify(value) ?? 'null';
	}
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(',')}]`;
	}
	const obj = value as Record<string, unknown>;
	const pairs = Object.keys(obj)
		.sort()
		.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);

	return `{${pairs.join(',')}}`;
}

export function generateFingerprint(ruleId: string, ruleIdentifier: Record<string, unknown>): string {
	return createHash('sha256')
		.update(stableStringify({ ruleId, data: ruleIdentifier }))
		.digest('hex');
}
