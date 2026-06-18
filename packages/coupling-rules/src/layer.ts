import { type Artifact, defineRuleBuilder, type Rule, type RuleOutput } from '@maat-tools/contracts';
import { isMatch } from '@maat-tools/utils';
import { DEPENDS_ON_CAPABILITY, type DependsOn } from '@maat-tools/vocabulary';
import { Pure, type Role } from './roles';

export type PureRoleOptions = {
	readonly transitive?: boolean;
};

function getValidTargetPath(dependsOn: DependsOn[], target: string): string {
	const validPackage = dependsOn.find((dep) => dep.from.package?.name === target);

	if (validPackage) {
		return `${validPackage.from.package?.rootPath ?? target}/**`;
	}

	return target;
}

function purityEvaluation(dep: DependsOn, targetPath: string): boolean {
	const relevantToTarget = isMatch(dep.from.path, [targetPath]);
	if (!relevantToTarget) {
		return false;
	}

	const importingFromItselfViaPackage = dep.to.isExternal && dep.to.path === dep.from.package?.name;
	if (importingFromItselfViaPackage) {
		return false;
	}

	const importingAnotherInternalFile = !dep.to.isExternal && isMatch(dep.to.path, [targetPath]);
	if (importingAnotherInternalFile) {
		return false;
	}

	return true;
}

class PureLayerRule implements Rule<'dependsOn'> {
	public readonly id: string;
	public readonly instanceId: string;
	public readonly needFacts = [DEPENDS_ON_CAPABILITY] as const;

	public constructor(private readonly target: string) {
		this.id = 'maat-tools/coupling-rules/pure-imports@v1';
		this.instanceId = `${this.id}:${target}`;
	}

	public evaluate(facts: { dependsOn: DependsOn[] }): RuleOutput[] {
		const findings: RuleOutput[] = [];
		const targetPath = getValidTargetPath(facts.dependsOn, this.target);

		for (const dep of facts.dependsOn) {
			if (!purityEvaluation(dep, targetPath)) {
				continue;
			}

			findings.push({
				ruleId: this.id,
				ruleIdentifier: { target: this.target, dependency: dep.to.path },
				message: `"${this.target}" depends on "${dep.to.path}" — not allowed for a Pure layer`,
				artifacts: [{ kind: DEPENDS_ON_CAPABILITY, data: dep }],
			});
		}

		return findings;
	}

	public describeArtifact(artifact: Artifact): Record<string, string> {
		if (artifact.kind !== DEPENDS_ON_CAPABILITY) {
			return { value: String(artifact.data) };
		}
		const dep = artifact.data as DependsOn;

		return { file: `${dep.from.path}:${dep.from.location.line}:${dep.from.location.column}`, dependency: dep.to.path };
	}
}

class LayerRule implements Rule<'dependsOn'> {
	public readonly id: string;
	public readonly instanceId: string;
	public readonly needFacts = [DEPENDS_ON_CAPABILITY] as const;

	public constructor(
		private readonly target: string,
		private readonly allowed: readonly (string | RegExp)[],
		private readonly transitive: boolean = false,
	) {
		this.id = 'maat-tools/coupling-rules/layer-imports@v1';
		this.instanceId = `${this.id}:${target}`;
	}

	public evaluate(facts: { dependsOn: DependsOn[] }): RuleOutput[] {
		const findings: RuleOutput[] = [];
		const targetPath = getValidTargetPath(facts.dependsOn, this.target);
		const directDependencies: DependsOn[] = [];

		for (const dep of facts.dependsOn) {
			if (!purityEvaluation(dep, targetPath)) {
				continue;
			}

			directDependencies.push(dep);
			if (this.isAllowed(dep)) {
				continue;
			}

			findings.push({
				ruleId: this.id,
				ruleIdentifier: { target: this.target, dependency: dep.to.path },
				message: `"${this.target}" depends on "${dep.to.path}" — not declared in allowed imports layer`,
				artifacts: [{ kind: DEPENDS_ON_CAPABILITY, data: dep }],
			});
		}

		if (this.transitive) {
			findings.push(...this.evaluateTransitiveImports(facts.dependsOn, directDependencies, targetPath));
		}

		return findings;
	}

	public describeArtifact(artifact: Artifact): Record<string, string> {
		if (artifact.kind !== DEPENDS_ON_CAPABILITY) {
			return { value: String(artifact.data) };
		}
		const dep = artifact.data as DependsOn;

		return { file: `${dep.from.path}:${dep.from.location.line}:${dep.from.location.column}`, dependency: dep.to.path };
	}

	private isAllowed(dep: DependsOn): boolean {
		return this.allowed.some((p) => (typeof p === 'string' ? isMatch(dep.to.path, [p]) : p.test(dep.to.path)));
	}

	private evaluateTransitiveImports(
		allDependencies: DependsOn[],
		directDependencies: DependsOn[],
		_rootGlob: string,
	): RuleOutput[] {
		const findings: RuleOutput[] = [];
		const dependenciesByPath = new Map<string, DependsOn[]>();
		const visited = new Set<string>([]);
		const queue: Map<string, string> = new Map();
		const seenFindings = new Set<string>();

		for (const dep of allDependencies) {
			const imports = dependenciesByPath.get(dep.from.path) ?? [];
			imports.push(dep);
			dependenciesByPath.set(dep.from.path, imports);
		}

		for (const dep of directDependencies) {
			const alreadyHandledByMainFlow = dep.to.isExternal || !this.isAllowed(dep);
			if (alreadyHandledByMainFlow) {
				continue;
			}

			if (!visited.has(dep.to.path)) {
				visited.add(dep.to.path);
				queue.set(dep.from.path, dep.to.path);
			}
		}

		for (const [from, to] of queue) {
			const currentPath = to;
			if (!currentPath) {
				continue;
			}

			const dependenciesOfAllowedDependency = Array.from(dependenciesByPath.entries())
				.filter(([from]) => isMatch(from, [currentPath, `${currentPath}/**`]))
				.flatMap(([, deps]) => deps);

			for (const dep of dependenciesOfAllowedDependency) {
				if (!dep.to.isExternal && !visited.has(dep.to.path)) {
					visited.add(dep.to.path);
					queue.set(dep.from.path, dep.to.path);
					continue;
				}
				if (this.isAllowed(dep)) {
					continue;
				}

				const key = `${currentPath}\0${dep.to.path} `;
				if (seenFindings.has(key)) {
					continue;
				}
				seenFindings.add(key);

				findings.push({
					ruleId: this.id,
					ruleIdentifier: { target: this.target, currentPath, dependency: dep.to.path },
					message: `"[Transitive] Target:(${this.target}) at file: "${from}" depends on "${dep.to.path}" via "${currentPath}" — not declared in allowed imports layer`,
					artifacts: [{ kind: DEPENDS_ON_CAPABILITY, data: dep }],
				});
			}
		}

		return findings;
	}
}

class LayerBuilderState {
	public role: Role | null = null;
	public roleOptions: PureRoleOptions = {};
	public readonly allowed: (string | RegExp)[] = [];
	public transitive: boolean = false;

	public constructor(public readonly target: string) {
		if (!target) {
			throw new Error('layer() requires a non-empty target');
		}
		if (target.startsWith('./') || target.startsWith('../')) {
			throw new Error(
				'layer() target cannot be a relative path, it must be a package name or glob pattern without leading ./ or ../',
			);
		}
	}

	public build(): Rule<'dependsOn'> {
		// Compare by role name, not object identity: bundlers can inline a separate
		// copy of the Pure singleton into each entry point, so a Pure imported from
		// one subpath (e.g. /roles) is not identity-equal to the one used here.
		if (this.role?.name === Pure.name) {
			return new PureLayerRule(this.target);
		}

		return new LayerRule(this.target, this.allowed, this.transitive);
	}
}

export interface LayerReadyBuilder {
	build(options?: { transitive?: boolean }): Rule<'dependsOn'>;
	allows(...patterns: (string | RegExp)[]): LayerReadyBuilder;
}

export interface PureLayerReadyBuilder {
	build(): Rule<'dependsOn'>;
}

export interface LayerInitialBuilder {
	is(role: Role, options?: PureRoleOptions): PureLayerReadyBuilder;
	allows(...patterns: (string | RegExp)[]): LayerReadyBuilder;
}

export type LayerBuilder = LayerInitialBuilder;

function makeReadyBuilder(state: LayerBuilderState): LayerReadyBuilder {
	return defineRuleBuilder({
		build: (options: { transitive?: boolean } = {}) => {
			state.transitive = options.transitive ?? false;
			return state.build();
		},
		allows(...patterns: (string | RegExp)[]): LayerReadyBuilder {
			state.allowed.push(...patterns);

			return makeReadyBuilder(state);
		},
	});
}

export function layer(target: string): LayerInitialBuilder {
	const state = new LayerBuilderState(target);

	return {
		is(role: Role, options: PureRoleOptions = {}): PureLayerReadyBuilder {
			state.role = role;
			state.roleOptions = options;

			return defineRuleBuilder({
				build: () => state.build(),
			});
		},
		allows(...patterns: (string | RegExp)[]): LayerReadyBuilder {
			state.allowed.push(...patterns);

			return makeReadyBuilder(state);
		},
	};
}
