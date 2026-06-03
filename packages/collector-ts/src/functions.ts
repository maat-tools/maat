import type { FunctionSignature, Parameter } from '@maat-tools/vocabulary';
import type { SourceFile } from 'ts-morph';
import { makeLocation } from './utils';

export function collectFunctionSignatures(sourceFile: SourceFile, file: string): FunctionSignature[] {
	const signatures: FunctionSignature[] = [];

	for (const func of sourceFile.getFunctions()) {
		const params = func.getParameters();
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

		signatures.push({
			file,
			name: func.getName() ?? 'anonymous',
			parameters,
			heterogeneous: typeSet.size > 1,
			location: makeLocation(file, func),
			exported: func.isExported(),
		});
	}

	for (const classDecl of sourceFile.getClasses()) {
		for (const method of classDecl.getMethods()) {
			const params = method.getParameters();
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

			const modifiers = method.getModifiers().map((m) => m.getText());
			const isMethodExported = !modifiers.includes('private');

			signatures.push({
				file,
				name: `${classDecl.getName()}.${method.getName()}`,
				parameters,
				heterogeneous: typeSet.size > 1,
				location: makeLocation(file, method),
				exported: isMethodExported,
			});
		}
	}

	return signatures;
}
