import type { Constant } from '@maat-tools/vocabulary';
import { Node, type SourceFile, SyntaxKind } from 'ts-morph';
import { makeLocation } from './utils';

function inferContext(
	parentKind: SyntaxKind | undefined,
): 'import' | 'export' | 'argument' | 'return' | 'condition' | 'assignment' | 'other' {
	switch (parentKind) {
		case SyntaxKind.ImportDeclaration:
		case SyntaxKind.ExportDeclaration:
		case SyntaxKind.ModuleDeclaration:
		case SyntaxKind.ExternalModuleReference:
		case SyntaxKind.Decorator:
			return 'import';
		case SyntaxKind.PropertySignature:
		case SyntaxKind.MethodSignature:
			return 'other';
		case SyntaxKind.CallExpression:
		case SyntaxKind.NewExpression:
			return 'argument';
		case SyntaxKind.ReturnStatement:
			return 'return';
		case SyntaxKind.BinaryExpression:
		case SyntaxKind.ConditionalExpression:
			return 'condition';
		default:
			return 'assignment';
	}
}

export function collectConstants(sourceFile: SourceFile, file: string): Constant[] {
	const constants: Constant[] = [];

	for (const node of sourceFile.getDescendants()) {
		const kind = node.getKind();
		const raw = node.getText();
		const parent = node.getParent();
		const context = inferContext(parent?.getKind());
		const location: Constant['location'] = makeLocation(file, node);

		const isTypeofOperand =
			kind === SyntaxKind.StringLiteral &&
			Node.isBinaryExpression(parent) &&
			(parent.getLeft().getKind() === SyntaxKind.TypeOfExpression ||
				parent.getRight().getKind() === SyntaxKind.TypeOfExpression);

		if (kind === SyntaxKind.StringLiteral && !isTypeofOperand && context !== 'import' && context !== 'other') {
			constants.push({
				kind: 'string',
				value: raw.slice(1, -1),
				file,
				location,
			});
		} else if (kind === SyntaxKind.NumericLiteral) {
			constants.push({ kind: 'number', value: raw, file, location });
		}
	}

	return constants;
}
