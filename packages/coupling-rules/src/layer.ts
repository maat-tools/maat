import { type Artifact, defineRuleBuilder, type Rule, type RuleOutput } from '@maat-tools/contracts';
import { isGlob, isMatch } from '@maat-tools/utils';
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

	public evaluate(facts: { dependsOn: DependsOn[] }): { findings: RuleOutput[]; warnings?: string[] } {
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

		return { findings };
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

	private readonly target: string;
	private readonly allowed: readonly (string | RegExp)[];
	private readonly forbids: readonly (string | RegExp)[];
	private readonly transitive: boolean = false;

	public constructor({
		allowed,
		forbids,
		transitive,
		target,
	}: {
		target: string;
		allowed: (string | RegExp)[];
		forbids: (string | RegExp)[];
		transitive: boolean;
	}) {
		this.id = 'maat-tools/coupling-rules/layer-imports@v1';
		this.instanceId = `${this.id}:${target}`;
		if (allowed.length > 0 && forbids.length > 0) {
			throw new Error('LayerRule cannot have both allowed and forbids patterns');
		}
		if (allowed.length === 0 && forbids.length === 0) {
			throw new Error(
				'LayerRule must have either allowed or forbids patterns — use is(Pure) for zero-dependency layers',
			);
		}
		this.target = target;
		this.allowed = allowed;
		this.forbids = forbids;
		this.transitive = transitive;
	}

	public evaluate(facts: { dependsOn: DependsOn[] }): { findings: RuleOutput[]; warnings?: string[] } {
		const findings: RuleOutput[] = [];
		const targetPath = getValidTargetPath(facts.dependsOn, this.target);
		const directDependencies: DependsOn[] = [];

		const patterns = this.allowed.length ? this.allowed : this.forbids;
		const patternMatchesGraph = new Set<string | RegExp>();

		for (const dep of facts.dependsOn) {
			for (const p of patterns) {
				if (!patternMatchesGraph.has(p) && this.matchesPattern(dep.to.path, p)) {
					patternMatchesGraph.add(p);
				}
			}

			if (!purityEvaluation(dep, targetPath)) {
				continue;
			}
			directDependencies.push(dep);

			if (this.allowed.length && this.isAllowed(dep)) {
				continue;
			}

			if (this.forbids.length && !this.isForbidden(dep)) {
				continue;
			}

			findings.push({
				ruleId: this.id,
				ruleIdentifier: { target: this.target, dependency: dep.to.path },
				message: this.formatMessage(dep),
				artifacts: [{ kind: DEPENDS_ON_CAPABILITY, data: dep }],
			});
		}

		if (this.transitive) {
			findings.push(...this.evaluateTransitiveImports(facts.dependsOn, directDependencies));
		}

		const warnings: string[] = [];
		if (facts.dependsOn.length > 0) {
			for (const p of patterns) {
				if (!patternMatchesGraph.has(p)) {
					const warning =
						`[maat] layer("${this.target}") — pattern ${p instanceof RegExp ? p : `"${p}"`} ` +
						`matches no import anywhere in the dependency graph. Likely a typo or wrong glob.`;
					warnings.push(warning);
				}
			}
		}

		return {
			findings,
			...(warnings.length > 0 ? { warnings } : {}),
		};
	}

	public describeArtifact(artifact: Artifact): Record<string, string> {
		if (artifact.kind !== DEPENDS_ON_CAPABILITY) {
			return { value: String(artifact.data) };
		}
		const dep = artifact.data as DependsOn;

		return { file: `${dep.from.path}:${dep.from.location.line}:${dep.from.location.column}`, dependency: dep.to.path };
	}

	private formatMessage(dep: DependsOn): string {
		if (this.allowed.length > 0) {
			return `"${this.target}" depends on "${dep.to.path}" — not declared in allowed imports layer`;
		}

		return `"${this.target}" depends on "${dep.to.path}" — declared in forbidden imports layer`;
	}

	private matchesPattern(path: string, p: string | RegExp): boolean {
		if (p instanceof RegExp) {
			return p.test(path);
		}

		if (!isGlob(p)) {
			return path === p || path.startsWith(`${p}/`);
		}

		return isMatch(path, [p]);
	}

	private isAllowed(dep: DependsOn): boolean {
		return this.allowed.some((p) => this.matchesPattern(dep.to.path, p));
	}

	private isForbidden(dep: DependsOn): boolean {
		return this.forbids.some((p) => this.matchesPattern(dep.to.path, p));
	}

	private evaluateTransitiveImports(allDependencies: DependsOn[], directDependencies: DependsOn[]): RuleOutput[] {
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
			const alreadyHandledByMainFlow =
				(this.allowed.length && !this.isAllowed(dep)) || (this.forbids.length && this.isForbidden(dep));
			if (dep.to.isExternal || alreadyHandledByMainFlow) {
				continue;
			}

			if (!visited.has(dep.to.path)) {
				visited.add(dep.to.path);
				queue.set(dep.from.path, dep.to.path);
			}
		}

		for (const [_, to] of queue) {
			const currentPath = to;
			if (!currentPath) {
				continue;
			}

			const dependenciesOfAllowedDependency = Array.from(dependenciesByPath.entries())
				.filter(([from]) => isMatch(from, [currentPath, `${currentPath}/**`]))
				.flatMap(([, deps]) => deps);

			for (const dep of dependenciesOfAllowedDependency) {
				if (!dep.to.isExternal && !visited.has(dep.to.path)) {
					const isInternalForbidden = this.forbids.length > 0 && this.isForbidden(dep);
					if (!isInternalForbidden) {
						visited.add(dep.to.path);
						queue.set(dep.from.path, dep.to.path);
						continue;
					}
				}
				if (this.allowed.length && this.isAllowed(dep)) {
					continue;
				}

				if (this.forbids.length && !this.isForbidden(dep)) {
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
					message: this.formatTransitiveMessage(dep, currentPath),
					artifacts: [{ kind: DEPENDS_ON_CAPABILITY, data: dep }],
				});
			}
		}

		return findings;
	}

	private formatTransitiveMessage(dep: DependsOn, currentPath: string): string {
		if (this.allowed.length > 0) {
			return `"[Transitive] Target:(${this.target}) at file: "${dep.from.path}" depends on "${dep.to.path}" via "${currentPath}" — not declared in allowed imports layer`;
		}

		return `"[Transitive] Target:(${this.target}) at file: "${dep.from.path}" depends on "${dep.to.path}" via "${currentPath}" — declared in forbidden imports layer`;
	}
}

class LayerBuilderState {
	public role: Role | null = null;
	public roleOptions: PureRoleOptions = {};
	public readonly allowed: (string | RegExp)[] = [];
	public readonly forbids: (string | RegExp)[] = [];
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

		return new LayerRule({
			target: this.target,
			allowed: this.allowed,
			forbids: this.forbids,
			transitive: this.transitive,
		});
	}
}

export interface AllowLayerReadyBuilder {
	build(options?: { transitive?: boolean }): Rule<'dependsOn'>;
	allows(first: string | RegExp, ...rest: (string | RegExp)[]): AllowLayerReadyBuilder;
}
export interface ForbidsLayerReadyBuilder {
	build(options?: { transitive?: boolean }): Rule<'dependsOn'>;
	forbids(first: string | RegExp, ...rest: (string | RegExp)[]): ForbidsLayerReadyBuilder;
}

export interface PureLayerReadyBuilder {
	build(): Rule<'dependsOn'>;
}

export interface LayerInitialBuilder {
	is(role: Role, options?: PureRoleOptions): PureLayerReadyBuilder;
	allows(first: string | RegExp, ...rest: (string | RegExp)[]): AllowLayerReadyBuilder;
	forbids(first: string | RegExp, ...rest: (string | RegExp)[]): ForbidsLayerReadyBuilder;
}

export type LayerBuilder = LayerInitialBuilder;

function makeAllowReadyBuilder(state: LayerBuilderState): AllowLayerReadyBuilder {
	return defineRuleBuilder({
		build: (options: { transitive?: boolean } = {}) => {
			state.transitive = options.transitive ?? false;
			return state.build();
		},
		allows(first: string | RegExp, ...rest: (string | RegExp)[]): AllowLayerReadyBuilder {
			state.allowed.push(first, ...rest);

			return makeAllowReadyBuilder(state);
		},
	});
}

function makeForbidsReadyBuilder(state: LayerBuilderState): ForbidsLayerReadyBuilder {
	return defineRuleBuilder({
		build: (options: { transitive?: boolean } = {}) => {
			state.transitive = options.transitive ?? false;
			return state.build();
		},
		forbids(first: string | RegExp, ...rest: (string | RegExp)[]): ForbidsLayerReadyBuilder {
			state.forbids.push(first, ...rest);

			return makeForbidsReadyBuilder(state);
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
		allows(first: string | RegExp, ...rest: (string | RegExp)[]): AllowLayerReadyBuilder {
			state.allowed.push(first, ...rest);

			return makeAllowReadyBuilder(state);
		},
		forbids(first: string | RegExp, ...rest: (string | RegExp)[]): ForbidsLayerReadyBuilder {
			state.forbids.push(first, ...rest);

			return makeForbidsReadyBuilder(state);
		},
	};
}
