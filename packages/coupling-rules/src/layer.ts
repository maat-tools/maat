import { dirname, join, normalize } from 'node:path';
import { type Artifact, type BrandedRuleBuilder, defineRuleBuilder, type FindingRuleOutput, type Rule, type RuleBuilder } from '@maat-tools/contracts';
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

export class LayerBuilder implements RuleBuilder {
	public readonly target: string;
	private role: Role | null = null;
	private allowed: (string | RegExp)[] = [];

	public constructor(target: string) {
		this.target = target;
	}

	public is(role: Role): this {
		this.role = role;

		return this;
	}

	public allows(...patterns: (string | RegExp)[]): this {
		this.allowed.push(...patterns);

		return this;
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

export function layer(target: string): LayerBuilder & BrandedRuleBuilder {
	return defineRuleBuilder(new LayerBuilder(target));
}
