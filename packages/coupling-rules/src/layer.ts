import {
	type Artifact,
	defineRuleBuilder,
	type FindingRuleOutput,
	type Rule,
	type RuleBuilder,
} from '@maat/contracts';
import { IMPORTS_CAPABILITY, type Import } from '@maat/vocabulary';
import type { Role } from './roles';

class LayerRule implements Rule<'imports'> {
	readonly id: string;
	readonly needFacts = [IMPORTS_CAPABILITY] as const;

	constructor(
		private readonly target: string,
		private readonly role: Role | null,
		private readonly allowed: readonly (string | RegExp)[],
	) {
		this.id = `layer:${target}@v1`;
	}

	evaluate(facts: { imports: Import[] }): FindingRuleOutput[] {
		const findings: FindingRuleOutput[] = [];

		for (const imp of facts.imports) {
			if (imp.packageName !== this.target) {
				continue;
			}
			if (this.isRelative(imp.specifier)) {
				continue;
			}
			if (this.isAllowed(imp.specifier)) {
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

	describeArtifact(artifact: Artifact): Record<string, string> {
		if (artifact.kind === 'import') {
			const imp = artifact.data as Import;
			return {
				file: imp.file,
				specifier: imp.specifier,
			};
		}
		return { value: String(artifact.data) };
	}

	private isRelative(specifier: string): boolean {
		return specifier.startsWith('./') || specifier.startsWith('../');
	}

	private isAllowed(specifier: string): boolean {
		return this.allowed.some((pattern) => {
			if (typeof pattern === 'string') {
				return specifier === pattern || specifier.startsWith(`${pattern}/`);
			}
			return pattern.test(specifier);
		});
	}
}

export class LayerBuilder implements RuleBuilder {
	readonly target: string;
	private _role: Role | null = null;
	private _allowed: (string | RegExp)[] = [];

	constructor(target: string) {
		this.target = target;
	}

	get role(): Role | null {
		return this._role;
	}

	is(role: Role): this {
		this._role = role;
		return this;
	}

	allows(...patterns: (string | RegExp)[]): this {
		this._allowed.push(...patterns);
		return this;
	}

	build(): Rule<'imports'> {
		return new LayerRule(this.target, this._role, this._allowed);
	}
}

export function layer(target: string) {
	return defineRuleBuilder(new LayerBuilder(target));
}
