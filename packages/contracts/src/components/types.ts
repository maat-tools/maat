export type Artifact = {
	kind: string;
	data: unknown;
};

export type Finding = {
	ruleId: string;
	instanceId: string;
	fingerprint: string;
	message: string;
	artifacts: Artifact[];
	requiresVerification?: boolean;
};
