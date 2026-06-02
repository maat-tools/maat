import type { PositionalAccess, PositionalSource } from '@maat-tools/vocabulary';
import {
	type ArrayBindingPattern,
	type ArrayLiteralExpression,
	type AsExpression,
	type CallExpression,
	type Node,
	type NumericLiteral,
	type SourceFile,
	SyntaxKind,
	type TupleTypeNode,
	type VariableDeclaration,
} from 'ts-morph';
import { toProjectRelativePath } from './dependencies';
import { makeLocation } from './utils';

const POSITIONAL_API_CALLS = ['split', 'match', 'matchAll', 'Object.values', 'Object.entries'];

function isPositionalApiCall(name: string): boolean {
	return POSITIONAL_API_CALLS.some((api) => name.endsWith(`.${api}`) || name === api);
}

function heterogeneous(positions: { type: string }[]): boolean {
	return new Set(positions.map((p) => p.type)).size > 1;
}

function tupleNodePositions(node: TupleTypeNode): { index: number; type: string }[] {
	return node.getElements().map((el, i) => ({ index: i, type: (el as { getText(): string }).getText() }));
}

function resolveOrigin(expr: Node, rootDir: string): { file: string; name: string } | undefined {
	const rawSymbol = expr.getSymbol();
	const sym = rawSymbol?.getAliasedSymbol() ?? rawSymbol;
	if (!sym) {
		return undefined;
	}

	const [firstDecl] = sym.getDeclarations();
	if (!firstDecl) {
		return undefined;
	}

	if (firstDecl.getKind() === SyntaxKind.VariableDeclaration) {
		const initializer = (firstDecl as VariableDeclaration).getInitializer();

		if (initializer?.getKind() === SyntaxKind.CallExpression) {
			const calleeRaw = (initializer as CallExpression).getExpression().getSymbol();
			const calleeSym = calleeRaw?.getAliasedSymbol() ?? calleeRaw;
			const [calleeDecl] = calleeSym?.getDeclarations() ?? [];
			if (calleeSym && calleeDecl) {
				return {
					file: toProjectRelativePath(rootDir, calleeDecl.getSourceFile().getFilePath() as string),
					name: calleeSym.getName(),
				};
			}
		}
	}

	return {
		file: toProjectRelativePath(rootDir, firstDecl.getSourceFile().getFilePath() as string),
		name: sym.getName(),
	};
}

export function collectPositionalSources(sourceFile: SourceFile, file: string): PositionalSource[] {
	const sources: PositionalSource[] = [];
	const sourceMap = new Map<string, PositionalSource>();

	function pushSource(source: PositionalSource): void {
		sources.push(source);
		sourceMap.set(source.name, source);
	}

	for (const func of sourceFile.getFunctions()) {
		const returnTypeNode = func.getReturnTypeNode();
		const name = func.getName() ?? 'anonymous';
		const location = makeLocation(file, func);

		if (returnTypeNode?.getKind() === SyntaxKind.TupleType) {
			const positions = tupleNodePositions(returnTypeNode as TupleTypeNode);

			pushSource({ file, type: 'function', name, positions, isHeterogeneous: heterogeneous(positions), location });
		} else {
			for (const ret of func.getDescendantsOfKind(SyntaxKind.ReturnStatement)) {
				const expr = ret.getExpression();
				if (expr?.getKind() !== SyntaxKind.ArrayLiteralExpression) {
					continue;
				}

				const elements = (expr as ArrayLiteralExpression).getElements();
				if (!elements.length) {
					continue;
				}

				const positions = elements.map((el, i) => ({ index: i, type: el.getType().getText(el) }));
				pushSource({ file, type: 'function', name, positions, isHeterogeneous: heterogeneous(positions), location });
				break;
			}
		}
	}

	for (const classDecl of sourceFile.getClasses()) {
		for (const method of classDecl.getMethods()) {
			const returnTypeNode = method.getReturnTypeNode();
			if (returnTypeNode?.getKind() !== SyntaxKind.TupleType) {
				continue;
			}

			const positions = tupleNodePositions(returnTypeNode as TupleTypeNode);
			pushSource({
				file,
				type: 'function',
				name: `${classDecl.getName()}.${method.getName()}`,
				positions,
				isHeterogeneous: heterogeneous(positions),
				location: makeLocation(file, method),
			});
		}
	}

	for (const varDecl of sourceFile.getVariableDeclarations()) {
		const initializer = varDecl.getInitializer();
		if (!initializer) {
			continue;
		}

		const name = varDecl.getName();
		const location = makeLocation(file, varDecl);

		if (initializer.getKind() === SyntaxKind.ArrayLiteralExpression) {
			const positions = (initializer as ArrayLiteralExpression).getElements().map((el, i) => ({
				index: i,
				type: el.getType().getBaseTypeOfLiteralType().getText(el),
			}));
			pushSource({ file, type: 'variable', name, positions, isHeterogeneous: heterogeneous(positions), location });
		} else if (initializer.getKind() === SyntaxKind.AsExpression) {
			const typeNode = (initializer as AsExpression).getTypeNode();
			if (typeNode?.getKind() !== SyntaxKind.TupleType) {
				continue;
			}

			const positions = tupleNodePositions(typeNode as TupleTypeNode);
			pushSource({ file, type: 'variable', name, positions, isHeterogeneous: heterogeneous(positions), location });
		} else if (initializer.getKind() === SyntaxKind.CallExpression) {
			const calledName = (initializer as CallExpression).getExpression().getText();
			const source = sourceMap.get(calledName);
			if (source) {
				pushSource({
					file,
					type: 'variable',
					name,
					positions: source.positions,
					isHeterogeneous: source.isHeterogeneous,
					location,
				});
			} else if (isPositionalApiCall(calledName)) {
				pushSource({
					file,
					type: 'variable',
					name,
					positions: [{ index: 0, type: 'unknown' }],
					isHeterogeneous: false,
					location,
				});
			}
		}
	}

	return sources;
}

export function collectPositionalAccesses(sourceFile: SourceFile, file: string, rootDir: string): PositionalAccess[] {
	const accesses: PositionalAccess[] = [];

	for (const node of sourceFile.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
		const argument = node.getArgumentExpression();
		if (!argument) {
			continue;
		}

		const expr = node.getExpression();
		const isCall = expr.getKind() === SyntaxKind.CallExpression;
		const targetExpr = isCall ? (expr as CallExpression).getExpression() : expr;
		const name = isCall ? expr.getText().replace(/\(.*\)$/, '') : expr.getText();
		const base = {
			file,
			name,
			type: isCall ? ('function' as const) : ('variable' as const),
			origin: resolveOrigin(targetExpr, rootDir),
			accessKind: 'index' as const,
			location: makeLocation(file, node),
		};

		accesses.push({
			...base,
			accessedIndex:
				argument.getKind() === SyntaxKind.NumericLiteral
					? parseInt((argument as NumericLiteral).getLiteralText(), 10)
					: argument.getText(),
		});
	}

	for (const varDecl of sourceFile.getVariableDeclarations()) {
		const nameNode = varDecl.getNameNode();
		if (nameNode.getKind() !== SyntaxKind.ArrayBindingPattern) {
			continue;
		}

		const initializer = varDecl.getInitializer();
		if (!initializer) {
			continue;
		}

		const isCall = initializer.getKind() === SyntaxKind.CallExpression;
		const targetExpr = isCall ? (initializer as CallExpression).getExpression() : initializer;
		const name = isCall ? (initializer as CallExpression).getExpression().getText() : initializer.getText();
		const elements = (nameNode as ArrayBindingPattern).getElements();

		for (let i = 0; i < elements.length; i++) {
			accesses.push({
				file,
				name,
				type: isCall ? 'function' : 'variable',
				origin: resolveOrigin(targetExpr, rootDir),
				accessedIndex: i,
				accessKind: 'destructuring',
				location: makeLocation(file, varDecl),
			});
		}
	}

	return accesses;
}
