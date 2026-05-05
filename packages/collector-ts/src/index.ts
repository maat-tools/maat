import { resolve } from 'node:path';
import {
	type Collector,
	defineCollector,
	type FactRegistry,
} from '@maat/contracts';
import {
	CONSTANTS_CAPABILITY,
	type Constant,
	type ConstantContext,
} from '@maat/vocabulary';
import { Project } from 'ts-morph';

export type TSInput = {
	tsConfigFilePath: string;
};

const getContext = (parentKind: string | undefined): ConstantContext => {
	switch (parentKind) {
		case 'ImportDeclaration':
		case 'ExportDeclaration':
			return 'import';
		case 'CallExpression':
		case 'NewExpression':
			return 'argument';
		case 'ReturnStatement':
			return 'return';
		case 'BinaryExpression':
		case 'ConditionalExpression':
			return 'condition';
		case 'Decorator':
			return 'decorator';
		default:
			return 'assignment';
	}
};

export class TSCollector implements Collector<'constants'> {
	public readonly id = 'ts';
	public readonly provideFacts = [CONSTANTS_CAPABILITY] as const;

	constructor(private readonly config: TSInput) { }

	public async collect(): Promise<Pick<FactRegistry, 'constants'>> {
		const resolvedPath = resolve(this.config.tsConfigFilePath);
		const project = new Project({ tsConfigFilePath: resolvedPath });
		const sourceFiles = project.getSourceFiles();

		const constants: Constant[] = [];

		for (const sourceFile of sourceFiles) {
			const file = sourceFile.getFilePath();

			for (const node of sourceFile.getDescendants()) {
				const kind = node.getKindName();
				const context = getContext(node.getParent()?.getKindName());
				const raw = node.getText();
				const location: Constant['location'] = {
					file,
					line: node.getStartLineNumber(),
					column: node.getStartLinePos(),
				};

				if (kind === 'StringLiteral') {
					constants.push({
						kind: 'string',
						value: raw.slice(1, -1),
						raw,
						context,
						location,
					});
				} else if (kind === 'NumericLiteral') {
					constants.push({
						kind: 'number',
						value: raw,
						raw,
						context,
						location,
					});
				}
			}
		}

		return { constants };
	}
}

declare module '@maat/contracts' {
	interface CollectorRegistry {
		'@maat/collector-ts': TSInput;
	}
}

export default defineCollector((config: TSInput) => new TSCollector(config));