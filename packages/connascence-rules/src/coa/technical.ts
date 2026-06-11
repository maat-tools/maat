import { type Artifact, defineRule, type RuleOutput, type Rule } from '@maat-tools/contracts';
import { ALGORITHMIC_BINDINGS_CAPABILITY, type AlgorithmicBinding } from '@maat-tools/vocabulary';

const UNIVERSAL_NOISE_BINDING_KEYS = new Set([',', '/', '\\']);

export type CoATechnicalOptions = {
	patterns?: string[];
	minFiles?: number;
	requireCompletePair?: boolean;
	requireSameContainer?: boolean;
	ignoreBindingKeys?: string[];
};

export class ConnascenceOfAlgorithmTechnicalRule implements Rule<'algorithmicBindings'> {
	public readonly id = 'maat-tools/coa-technical@v1';
	public readonly instanceId = this.id;
	public readonly needFacts = [ALGORITHMIC_BINDINGS_CAPABILITY] as const;

	private readonly patterns: Set<string> | null;
	private readonly minFiles: number;
	private readonly requireCompletePair: boolean;
	private readonly requireSameContainer: boolean;
	private readonly ignoreBindingKeys: Set<string>;

	public constructor(options: CoATechnicalOptions = {}) {
		this.patterns = options.patterns ? new Set(options.patterns) : null;
		this.minFiles = options.minFiles ?? 2;
		this.requireCompletePair = options.requireCompletePair ?? true;
		this.requireSameContainer = options.requireSameContainer ?? false;
		this.ignoreBindingKeys = new Set([...UNIVERSAL_NOISE_BINDING_KEYS, ...(options.ignoreBindingKeys ?? [])]);
	}

	public evaluate(facts: { algorithmicBindings: AlgorithmicBinding[] }): RuleOutput[] {
		const bindings = facts[ALGORITHMIC_BINDINGS_CAPABILITY] ?? [];

		const groups = new Map<string, AlgorithmicBinding[]>();
		for (const binding of bindings) {
			if (this.patterns && !this.patterns.has(binding.patternId)) {
				continue;
			}
			if (this.ignoreBindingKeys.has(binding.bindingKey)) {
				continue;
			}
			const key = JSON.stringify([binding.patternId, binding.bindingKey]);
			const group = groups.get(key) ?? [];
			group.push(binding);
			groups.set(key, group);
		}

		const findings: RuleOutput[] = [];

		for (const [key, group] of groups) {
			const files = new Set(group.map((b) => b.file));
			if (files.size < this.minFiles) {
				continue;
			}

			const roles = new Set(group.map((b) => b.role));
			if (this.requireCompletePair && roles.size < 2) {
				continue;
			}

			if (this.requireSameContainer) {
				const containers = new Map<string, Set<string>>();
				for (const b of group) {
					const container = b.containingFunction ?? b.file;
					const rolesInContainer = containers.get(container) ?? new Set<string>();
					rolesInContainer.add(b.role);
					containers.set(container, rolesInContainer);
				}
				const hasSharedContainer = Array.from(containers.values()).some((rolesSet) => rolesSet.size >= 2);
				if (!hasSharedContainer) {
					continue;
				}
			}

			const [patternId, bindingKey] = JSON.parse(key) as [string, string];
			if (bindingKey === '') {
				continue;
			}
			const first = group.at(0);
			if (!first) {
				continue;
			}

			findings.push({
				ruleId: this.id,
				ruleIdentifier: { patternId, bindingKey },
				message: `Pattern "${patternId}" shares invariant "${bindingKey}" across ${files.size} file(s) without a shared abstraction — possible Connascence of Algorithm`,
				artifacts: group.map((b) => ({
					kind: 'algorithmicBinding' as const,
					data: b,
				})),
			});
		}

		return findings;
	}

	public describeArtifact(artifact: Artifact): Record<string, string> {
		const b = artifact.data as AlgorithmicBinding;
		const loc = `${b.location.file}:${b.location.line}${b.location.column !== undefined ? `:${b.location.column}` : ''}`;
		return {
			location: loc,
			role: b.role,
			pattern: b.patternId,
			invariant: b.bindingKey,
			function: b.functionName,
			container: b.containingFunction ?? '(module-level)',
		};
	}
}

export default defineRule((options?: CoATechnicalOptions) => new ConnascenceOfAlgorithmTechnicalRule(options));
