import type { AlgorithmicBinding, AlgorithmicPattern } from '@maat-tools/vocabulary';
import {
	type CallExpression,
	type ClassDeclaration,
	type FunctionDeclaration,
	type MethodDeclaration,
	type NewExpression,
	type Node,
	type SourceFile,
	SyntaxKind,
	type TemplateExpression,
	type VariableDeclaration,
} from 'ts-morph';

function getContainingFunctionName(node: Node): string | null {
	let current: Node | undefined = node.getParent();
	while (current) {
		const kind = current.getKind();
		if (kind === SyntaxKind.FunctionDeclaration) {
			return (current as FunctionDeclaration).getName() ?? 'anonymous';
		}
		if (kind === SyntaxKind.MethodDeclaration) {
			const method = current as MethodDeclaration;
			const classDecl = method.getParent();
			if (classDecl?.getKind() === SyntaxKind.ClassDeclaration) {
				return `${(classDecl as ClassDeclaration).getName()}.${method.getName()}`;
			}

			return method.getName();
		}
		if (kind === SyntaxKind.ArrowFunction) {
			const parent = current.getParent();
			if (parent?.getKind() === SyntaxKind.VariableDeclaration) {
				return (parent as VariableDeclaration).getName();
			}

			return 'arrow';
		}
		current = current.getParent();
	}
	return null;
}

function buildBinding(params: {
	patternId: string;
	role: string;
	bindingKey: string;
	functionName: string;
	file: string;
	node: Node;
	containingFunction: string | null;
}): AlgorithmicBinding {
	return {
		patternId: params.patternId,
		role: params.role,
		bindingKey: params.bindingKey,
		functionName: params.functionName,
		file: params.file,
		location: {
			file: params.file,
			line: params.node.getStartLineNumber(),
			column: params.node.getStartLinePos(),
		},
		containingFunction: params.containingFunction,
	};
}

function extractTemplateSegments(templateNode: TemplateExpression): string[] {
	const segments: string[] = [];
	const spans = templateNode.getTemplateSpans();

	// Head: "`text${"  → extract text between backtick and "${"
	const headLiteral = templateNode.getHead().getText().slice(1, -2);
	if (headLiteral.length > 0 && !/^(\s|\\[ntrfv0])+$/.test(headLiteral)) {
		segments.push(headLiteral);
	}

	for (let i = 0; i < spans.length; i++) {
		const span = spans[i];
		if (!span) {
			continue;
		}
		const literalText = span.getLiteral().getText();
		const isLast = i === spans.length - 1;
		// Middle: "}text${" → slice(1, -2) removes "}" and "${"
		// Tail:   "}text`"  → slice(1, -1) removes "}" and "`"
		const text = isLast ? literalText.slice(1, -1) : literalText.slice(1, -2);
		if (text.length > 0 && !(isLast && /^(\s|\\[ntrfv0])+$/.test(text))) {
			segments.push(text);
		}
	}

	return segments;
}

function collectTemplateBindings(
	sourceFile: SourceFile,
	file: string,
	patternId: string,
	role: string,
): AlgorithmicBinding[] {
	const bindings: AlgorithmicBinding[] = [];

	for (const node of sourceFile.getDescendants()) {
		if (node.getKind() !== SyntaxKind.TemplateExpression) {
			continue;
		}
		const templateNode = node as TemplateExpression;
		for (const segment of extractTemplateSegments(templateNode)) {
			bindings.push(
				buildBinding({
					patternId,
					role,
					bindingKey: segment,
					functionName: 'template-literal',
					file,
					node,
					containingFunction: getContainingFunctionName(templateNode),
				}),
			);
		}
	}

	return bindings;
}

function collectCallBindings(
	sourceFile: SourceFile,
	file: string,
	patternId: string,
	role: string,
	functionRegex: RegExp,
	literalArgIndex: number | undefined,
	expressionKind: 'call' | 'new',
): AlgorithmicBinding[] {
	const bindings: AlgorithmicBinding[] = [];
	const targetKind = expressionKind === 'new' ? SyntaxKind.NewExpression : SyntaxKind.CallExpression;

	for (const node of sourceFile.getDescendants()) {
		if (node.getKind() !== targetKind) {
			continue;
		}
		const exprNode = node as CallExpression | NewExpression;
		const calledName = exprNode.getExpression().getText();
		if (!functionRegex.test(calledName)) {
			continue;
		}

		if (literalArgIndex !== undefined) {
			const arg = exprNode.getArguments()[literalArgIndex];
			if (!arg || arg.getKind() !== SyntaxKind.StringLiteral) {
				continue;
			}
			bindings.push(
				buildBinding({
					patternId,
					role,
					bindingKey: arg.getText().slice(1, -1),
					functionName: calledName,
					file,
					node,
					containingFunction: getContainingFunctionName(exprNode),
				}),
			);
		} else {
			bindings.push(
				buildBinding({
					patternId,
					role,
					bindingKey: '',
					functionName: calledName,
					file,
					node,
					containingFunction: getContainingFunctionName(exprNode),
				}),
			);
		}
	}

	return bindings;
}

export function collectAlgorithmicBindings(
	sourceFile: SourceFile,
	file: string,
	patterns: AlgorithmicPattern[],
): AlgorithmicBinding[] {
	if (patterns.length === 0) {
		return [];
	}

	const bindings: AlgorithmicBinding[] = [];

	for (const pattern of patterns) {
		for (const matcher of pattern.matchers) {
			const expressionKind = matcher.expressionKind ?? 'call';
			if (expressionKind === 'template') {
				bindings.push(...collectTemplateBindings(sourceFile, file, pattern.id, matcher.role));
			} else {
				bindings.push(
					...collectCallBindings(
						sourceFile,
						file,
						pattern.id,
						matcher.role,
						new RegExp(matcher.functionPattern),
						matcher.literalArgIndex,
						expressionKind,
					),
				);
			}
		}
	}

	return bindings;
}
