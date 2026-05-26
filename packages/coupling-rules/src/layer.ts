import { dirname, join, normalize } from 'node:path';
import { type Artifact, defineRuleBuilder, type FindingRuleOutput, type Rule } from '@maat-tools/contracts';
import { CALL_GRAPH_CAPABILITY, type CallGraph, IMPORTS_CAPABILITY, type Import } from '@maat-tools/vocabulary';
import { Pure, type Role } from './roles';

export type PureRoleOptions = {
	readonly transitive?: boolean;
};

function isPathMode(target: string): boolean {
	return target.startsWith('./');
}

function matchGlob(value: string, pattern: string): boolean {
	const normalized = pattern.startsWith('./') ? pattern.slice(2) : pattern;
	const regexStr = normalized
		.split('**')
		.map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+'))
		.join('.*');

	return new RegExp(`^${regexStr}$`).test(value);
}

function resolveSpecifier(file: string, specifier: string): string {
	if (specifier.startsWith('./') || specifier.startsWith('../')) {
		return normalize(join(dirname(file), specifier)).replace(/\\/g, '/');
	}

	return specifier;
}

function matchesAny(value: string, patterns: readonly (string | RegExp)[]): boolean {
	return patterns.some((pattern) => {
		if (typeof pattern === 'string') {
			if (isPathMode(pattern)) {
				return matchGlob(value, pattern);
			}

			return value === pattern || value.startsWith(`${pattern}/`);
		}

		return pattern.test(value);
	});
}

function packageForSpecifier(specifier: string, packages: ReadonlySet<string>): string | null {
	let match: string | null = null;

	for (const packageName of packages) {
		if (specifier === packageName || specifier.startsWith(`${packageName}/`)) {
			if (match === null || packageName.length > match.length) {
				match = packageName;
			}
		}
	}

	return match;
}

class PathLayerRule implements Rule<'imports' | 'callGraph'> {
	public readonly id: string;
	public readonly needFacts = [IMPORTS_CAPABILITY, CALL_GRAPH_CAPABILITY] as const;

	public constructor(
		private readonly target: string,
		private readonly role: Role | null,
		private readonly allowed: readonly (string | RegExp)[],
	) {
		const prefix = role === Pure ? 'coupling/pure-imports' : 'coupling/layer-imports';
		this.id = `${prefix}:${target}@v1`;
	}

	private buildCallGraphPackages(callGraph: CallGraph): Map<string, Set<string>> {
		const packageCalls = new Map<string, Set<string>>();

		for (const edge of callGraph.edges) {
			const callerFile = edge.location.file;

			const calleeId = edge.calleeId;
			const calleeParts = calleeId.split('/node_modules/');
			let calleePkg: string | null = null;
			if (calleeParts.length > 1) {
				const pkgPath = calleeParts[1];
				calleePkg = pkgPath?.split('/')[0] ?? null;
			}

			if (calleePkg) {
				if (!packageCalls.has(callerFile)) {
					packageCalls.set(callerFile, new Set());
				}
				const callers = packageCalls.get(callerFile);
				if (callers) {
					callers.add(calleePkg);
				}
			}
		}

		return packageCalls;
	}

	public evaluate(facts: { imports: Import[]; callGraph: CallGraph }): FindingRuleOutput[] {
		const findings: FindingRuleOutput[] = [];

		for (const imp of facts.imports) {
			if (!matchGlob(imp.file, this.target)) {
				continue;
			}
			if (imp.specifier.startsWith('./')) {
				continue;
			}

			const resolved = resolveSpecifier(imp.file, imp.specifier);
			if (matchesAny(resolved, this.allowed)) {
				continue;
			}

			findings.push({
				ruleId: this.id,
				ruleIdentifier: { target: this.target, specifier: imp.specifier },
				message: `"${imp.file}" imports "${imp.specifier}" — not declared in allowed imports${this.role ? ` for ${this.role.name} layer` : ''}`,
				artifacts: [{ kind: 'import', data: imp }],
			});
		}

		const packageCalls = this.buildCallGraphPackages(facts.callGraph);

		for (const imp of facts.imports) {
			if (!matchGlob(imp.file, this.target)) {
				continue;
			}

			const runtimePackages = packageCalls.get(imp.file);
			if (!runtimePackages) {
				continue;
			}

			for (const pkg of runtimePackages) {
				if (matchesAny(pkg, this.allowed)) {
					continue;
				}

				const alreadyReported = findings.some((f) => {
					const spec = f.ruleIdentifier.specifier as string | undefined;
					return spec === pkg || spec?.startsWith(`${pkg}/`);
				});
				if (alreadyReported) {
					continue;
				}

				findings.push({
					ruleId: this.id,
					ruleIdentifier: { target: this.target, specifier: pkg, runtime: true },
					message: `"${imp.file}" has runtime coupling to "${pkg}" via call graph — not declared in allowed imports`,
					artifacts: [{ kind: 'import', data: imp }],
				});
			}
		}

		return findings;
	}

	public describeArtifact(artifact: Artifact): Record<string, string> {
		if (artifact.kind === 'import') {
			const imp = artifact.data as Import;

			return { file: imp.file, specifier: imp.specifier };
		}

		return { value: String(artifact.data) };
	}
}

class PureLayerRule implements Rule<'imports'> {
	public readonly id: string;
	public readonly needFacts = [IMPORTS_CAPABILITY] as const;

	public constructor(
		private readonly target: string,
		private readonly allowed: readonly (string | RegExp)[],
		private readonly transitive: boolean,
	) {
		this.id = `coupling/pure-imports:${target}@v1`;
	}

	public evaluate(facts: { imports: Import[] }): FindingRuleOutput[] {
		const findings: FindingRuleOutput[] = [];
		const directImports: Import[] = [];

		for (const imp of facts.imports) {
			if (imp.packageName !== this.target) {
				continue;
			}
			if (imp.specifier.startsWith('./') || imp.specifier.startsWith('../')) {
				continue;
			}
			directImports.push(imp);
			if (matchesAny(imp.specifier, this.allowed)) {
				continue;
			}

			findings.push({
				ruleId: this.id,
				ruleIdentifier: { target: this.target, specifier: imp.specifier },
				message: `"${this.target}" imports "${imp.specifier}" — not declared in allowed imports for Pure layer`,
				artifacts: [{ kind: 'import', data: imp }],
			});
		}

		if (this.transitive) {
			findings.push(...this.evaluateTransitiveImports(facts.imports, directImports));
		}

		return findings;
	}

	private evaluateTransitiveImports(allImports: Import[], directImports: Import[]): FindingRuleOutput[] {
		const findings: FindingRuleOutput[] = [];
		const localPackages = new Set(
			allImports.map((imp) => imp.packageName).filter((name): name is string => name !== null),
		);
		const importsByPackage = new Map<string, Import[]>();
		const visited = new Set<string>([this.target]);
		const queue: string[] = [];
		const seenFindings = new Set<string>();

		for (const imp of allImports) {
			if (imp.packageName === null) {
				continue;
			}
			const imports = importsByPackage.get(imp.packageName) ?? [];
			imports.push(imp);
			importsByPackage.set(imp.packageName, imports);
		}

		for (const imp of directImports) {
			if (!matchesAny(imp.specifier, this.allowed)) {
				continue;
			}
			const packageName = packageForSpecifier(imp.specifier, localPackages);
			if (packageName !== null && !visited.has(packageName)) {
				visited.add(packageName);
				queue.push(packageName);
			}
		}

		for (let i = 0; i < queue.length; i++) {
			const currentPackage = queue[i];
			if (currentPackage === undefined) {
				continue;
			}
			const imports = importsByPackage.get(currentPackage) ?? [];

			for (const imp of imports) {
				if (
					imp.specifier === '.' ||
					imp.specifier === '..' ||
					imp.specifier.startsWith('./') ||
					imp.specifier.startsWith('../')
				) {
					continue;
				}

				const packageName = packageForSpecifier(imp.specifier, localPackages);
				if (packageName !== null && !visited.has(packageName)) {
					visited.add(packageName);
					queue.push(packageName);
				}

				if (matchesAny(imp.specifier, this.allowed)) {
					continue;
				}

				const key = `${currentPackage}\0${imp.specifier}`;
				if (seenFindings.has(key)) {
					continue;
				}
				seenFindings.add(key);

				findings.push({
					ruleId: this.id,
					ruleIdentifier: { target: this.target, via: currentPackage, specifier: imp.specifier },
					message: `"${this.target}" depends on "${currentPackage}", which imports "${imp.specifier}" — transitive dependency not declared for Pure layer`,
					artifacts: [{ kind: 'import', data: imp }],
				});
			}
		}

		return findings;
	}

	public describeArtifact(artifact: Artifact): Record<string, string> {
		if (artifact.kind === 'import') {
			const imp = artifact.data as Import;

			return { file: imp.file, specifier: imp.specifier };
		}

		return { value: String(artifact.data) };
	}
}

class LayerRule implements Rule<'imports' | 'callGraph'> {
	public readonly id: string;
	public readonly needFacts = [IMPORTS_CAPABILITY, CALL_GRAPH_CAPABILITY] as const;

	public constructor(
		private readonly target: string,
		private readonly role: Role | null,
		private readonly allowed: readonly (string | RegExp)[],
	) {
		this.id = `coupling/layer-imports:${target}@v1`;
	}

	private buildCallGraphPackages(callGraph: CallGraph, targetPackage: string): Set<string> {
		const runtimeDeps = new Set<string>();

		for (const edge of callGraph.edges) {
			const callerFile = edge.location.file;
			const calleeFile = edge.calleeId.split(':')[0];
			if (!calleeFile) {
				continue;
			}

			const callerPkg = this.extractPackage(callerFile);
			const calleePkg = this.extractPackage(calleeFile);

			if (callerPkg === targetPackage && calleePkg && calleePkg !== targetPackage) {
				runtimeDeps.add(calleePkg);
			}
		}

		return runtimeDeps;
	}

	private extractPackage(filePath: string): string | null {
		const parts = filePath.split('/node_modules/');
		if (parts.length > 1) {
			const pkgPath = parts[1];
			if (!pkgPath) {
				return null;
			}
			const firstSegment = pkgPath.split('/')[0];
			if (!firstSegment) {
				return null;
			}
			if (firstSegment.startsWith('@')) {
				const secondSegment = pkgPath.split('/')[1];
				if (secondSegment) {
					return `${firstSegment}/${secondSegment}`;
				}
			}
			return firstSegment;
		}
		return null;
	}

	public evaluate(facts: { imports: Import[]; callGraph: CallGraph }): FindingRuleOutput[] {
		const findings: FindingRuleOutput[] = [];

		for (const imp of facts.imports) {
			if (imp.packageName !== this.target) {
				continue;
			}
			if (imp.specifier.startsWith('./') || imp.specifier.startsWith('../')) {
				continue;
			}
			if (matchesAny(imp.specifier, this.allowed)) {
				continue;
			}

			findings.push({
				ruleId: this.id,
				ruleIdentifier: { target: this.target, specifier: imp.specifier },
				message: `"${this.target}" imports "${imp.specifier}" — not declared in allowed imports${this.role ? ` for ${this.role.name} layer` : ''}`,

				artifacts: [{ kind: 'import', data: imp }],
			});
		}

		const runtimeDeps = this.buildCallGraphPackages(facts.callGraph, this.target);

		for (const pkg of runtimeDeps) {
			if (matchesAny(pkg, this.allowed)) {
				continue;
			}

			const alreadyReported = findings.some((f) => {
				const spec = f.ruleIdentifier.specifier as string | undefined;
				return spec === pkg || spec?.startsWith(`${pkg}/`);
			});
			if (alreadyReported) {
				continue;
			}

			findings.push({
				ruleId: this.id,
				ruleIdentifier: { target: this.target, specifier: pkg, runtime: true },
				message: `"${this.target}" has runtime coupling to "${pkg}" via call graph — not declared in allowed imports`,
				artifacts: [],
			});
		}

		return findings;
	}

	public describeArtifact(artifact: Artifact): Record<string, string> {
		if (artifact.kind === 'import') {
			const imp = artifact.data as Import;

			return { file: imp.file, specifier: imp.specifier };
		}

		return { value: String(artifact.data) };
	}
}

class LayerBuilderState {
	public role: Role | null = null;
	public roleOptions: PureRoleOptions = {};
	public readonly allowed: (string | RegExp)[] = [];

	public constructor(public readonly target: string) {
		if (!target) {
			throw new Error('layer() requires a non-empty target');
		}
	}

	public build(): Rule<'imports' | 'callGraph'> {
		if (isPathMode(this.target)) {
			return new PathLayerRule(this.target, this.role, this.allowed);
		}
		if (this.role === Pure) {
			return new PureLayerRule(this.target, this.allowed, this.roleOptions.transitive ?? true);
		}

		return new LayerRule(this.target, this.role, this.allowed);
	}
}

export interface LayerReadyBuilder {
	build(): Rule<'imports' | 'callGraph'>;
	allows(...patterns: (string | RegExp)[]): LayerReadyBuilder;
}

export interface LayerInitialBuilder {
	is(role: Role, options?: PureRoleOptions): LayerReadyBuilder;
	allows(...patterns: (string | RegExp)[]): LayerReadyBuilder;
}

export type LayerBuilder = LayerInitialBuilder;

function makeReadyBuilder(state: LayerBuilderState): LayerReadyBuilder {
	return defineRuleBuilder({
		build: () => state.build(),
		allows(...patterns: (string | RegExp)[]): LayerReadyBuilder {
			state.allowed.push(...patterns);
			return makeReadyBuilder(state);
		},
	});
}

export function layer(target: string): LayerInitialBuilder {
	const state = new LayerBuilderState(target);

	return {
		is(role: Role, options: PureRoleOptions = {}): LayerReadyBuilder {
			state.role = role;
			state.roleOptions = options;
			return makeReadyBuilder(state);
		},
		allows(...patterns: (string | RegExp)[]): LayerReadyBuilder {
			state.allowed.push(...patterns);
			return makeReadyBuilder(state);
		},
	};
}
