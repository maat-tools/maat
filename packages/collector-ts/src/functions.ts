import type { FunctionSignature, Parameter, ReturnSite } from '@maat-tools/vocabulary';
import {
	type FunctionDeclaration,
	type MethodDeclaration,
	type ReturnTypedNode,
	type SourceFile,
	SyntaxKind,
	type TupleTypeNode,
} from 'ts-morph';
import { makeLocation } from './utils';

const GUARD_SNIPPET_MAX = 300;

function collectReturnSites(func: FunctionDeclaration | MethodDeclaration, file: string): ReturnSite[] {
	const sites: ReturnSite[] = [];

	for (const returnStmt of func.getDescendantsOfKind(SyntaxKind.ReturnStatement)) {
		const expr = returnStmt.getExpression();
		const value = expr ? expr.getText() : 'void';

		const guardParent = returnStmt.getParent()?.getParent();
		const guardSnippet = guardParent ? guardParent.getText().trim().slice(0, GUARD_SNIPPET_MAX) : undefined;

		sites.push({
			value,
			location: makeLocation(file, returnStmt),
			guardSnippet,
		});
	}

	return sites;
}

function getOutputHeterogeneous(node: ReturnTypedNode): boolean {
	const returnTypeNode = node.getReturnTypeNode();
	const returnType = node.getReturnType();
	const returnTypeText = returnType.getText();
	const outputTypeSet = new Set<string>();

	if (returnTypeNode?.getKind() === SyntaxKind.TupleType) {
		for (const el of (returnTypeNode as TupleTypeNode).getElements()) {
			outputTypeSet.add(el.getText());
		}
	} else if (returnType.isUnion()) {
		if (returnTypeText.includes('|')) {
			for (const t of returnTypeText.split('|').map((t) => t.trim())) {
				outputTypeSet.add(t);
			}
		} else {
			outputTypeSet.add(returnTypeText);
		}
	} else {
		outputTypeSet.add(returnTypeText);
	}

	return outputTypeSet.size > 1;
}

function collectParameters(node: FunctionDeclaration | MethodDeclaration): {
	parameters: Parameter[];
	heterogeneous: boolean;
} {
	const params = node.getParameters();
	const parameters: Parameter[] = [];
	const typeSet = new Set<string>();

	for (let i = 0; i < params.length; i++) {
		const param = params[i];
		if (!param) {
			continue;
		}

		const typeNode = param.getTypeNode();
		const type = typeNode ? typeNode.getText() : 'unknown';
		typeSet.add(type);
		parameters.push({
			name: param.getName(),
			type,
			position: i,
		});
	}

	return { parameters, heterogeneous: typeSet.size > 1 };
}

export function collectFunctionSignatures(sourceFile: SourceFile, file: string): FunctionSignature[] {
	const signatures: FunctionSignature[] = [];

	for (const func of sourceFile.getFunctions()) {
		const { parameters, heterogeneous: inputHeterogeneous } = collectParameters(func);

		signatures.push({
			file,
			name: func.getName() ?? 'anonymous',
			input: {
				heterogeneous: inputHeterogeneous,
				parameters,
			},
			output: {
				returnType: func.getReturnType().getText(),
				returnSites: collectReturnSites(func, file),
				heterogeneous: getOutputHeterogeneous(func),
			},
			location: makeLocation(file, func),
			exported: func.isExported(),
		});
	}

	for (const classDecl of sourceFile.getClasses()) {
		for (const method of classDecl.getMethods()) {
			const { parameters, heterogeneous: inputHeterogeneous } = collectParameters(method);
			const modifiers = method.getModifiers().map((m) => m.getText());
			const isMethodExported = !modifiers.includes('private');

			signatures.push({
				file,
				name: `${classDecl.getName()}.${method.getName()}`,
				input: {
					parameters,
					heterogeneous: inputHeterogeneous,
				},
				output: {
					returnType: method.getReturnType().getText(),
					returnSites: collectReturnSites(method, file),
					heterogeneous: getOutputHeterogeneous(method),
				},
				location: makeLocation(file, method),
				exported: isMethodExported,
			});
		}
	}

	return signatures;
}
