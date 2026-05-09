import { dirname, join, normalize } from 'node:path';
import {
	type Artifact,
	defineRuleBuilder,
	type FindingRuleOutput,
	type Rule,
} from '@maat-tools/contracts';
import { IMPORTS_CAPABILITY, type Import } from '@maat-tools/vocabulary';
import { Pure, type Role } from './roles';

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

class PathLayerRule implements Rule<'imports'> {
	public readonly id: string;
	public readonly needFacts = [IMPORTS_CAPABILITY] as const;

	public constructor(
		private readonly target: string,
		private readonly role: Role | null,
		private readonly allowed: readonly (string | RegExp)[],
	) {
		const prefix = role === Pure ? 'coupling/pure-imports' : 'coupling/layer-imports';
		this.id = `${prefix}:${target}@v1`;
	}

	public evaluate(facts: { imports: Import[] }): FindingRuleOutput[] {
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
	) {
		this.id = `coupling/pure-imports:${target}@v1`;
	}

	public evaluate(facts: { imports: Import[] }): FindingRuleOutput[] {
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
				message: `"${this.target}" imports "${imp.specifier}" — not declared in allowed imports for Pure layer`,
				artifacts: [{ kind: 'import', data: imp }],
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

class LayerRule implements Rule<'imports'> {
	public readonly id: string;
	public readonly needFacts = [IMPORTS_CAPABILITY] as const;

	public constructor(
		private readonly target: string,
		private readonly role: Role | null,
		private readonly allowed: readonly (string | RegExp)[],
	) {
		this.id = `coupling/layer-imports:${target}@v1`;
	}

	public evaluate(facts: { imports: Import[] }): FindingRuleOutput[] {
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
	public readonly allowed: (string | RegExp)[] = [];

	public constructor(public readonly target: string) {
		if (!target) {
			throw new Error('layer() requires a non-empty target');
		}
	}

	public build(): Rule<'imports'> {
		if (isPathMode(this.target)) {
			return new PathLayerRule(this.target, this.role, this.allowed);
		}
		if (this.role === Pure) {
			return new PureLayerRule(this.target, this.allowed);
		}

		return new LayerRule(this.target, this.role, this.allowed);
	}
}

export interface LayerReadyBuilder {
	build(): Rule<'imports'>;
	allows(...patterns: (string | RegExp)[]): LayerReadyBuilder;
}

export interface LayerInitialBuilder {
	is(role: Role): LayerReadyBuilder;
	allows(...patterns: (string | RegExp)[]): LayerReadyBuilder;
}

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
		is(role: Role): LayerReadyBuilder {
			state.role = role;
			return makeReadyBuilder(state);
		},
		allows(...patterns: (string | RegExp)[]): LayerReadyBuilder {
			state.allowed.push(...patterns);
			return makeReadyBuilder(state);
		},
	};
}
