import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { type Collector, defineCollector, type FactRegistry } from '@maat-tools/contracts';
import {
	ALGORITHMIC_BINDINGS_CAPABILITY,
	type AlgorithmicBinding,
	type AlgorithmicPattern,
	CONSTANTS_CAPABILITY,
	type Constant,
	type ConstantContext,
	FUNCTION_SIGNATURES_CAPABILITY,
	type FunctionSignature,
	IMPORTS_CAPABILITY,
	type Import,
	type Parameter,
	POSITIONAL_ACCESSES_CAPABILITY,
	POSITIONAL_SOURCES_CAPABILITY,
	type PositionalAccess,
	type PositionalSource,
} from '@maat-tools/vocabulary';
import micromatch from 'micromatch';

const { isMatch: micromatchIsMatch } = micromatch;

import { glob } from 'tinyglobby';
import {
	type ArrayBindingPattern,
	type ArrayLiteralExpression,
	type AsExpression,
	type CallExpression,
	type ClassDeclaration,
	type ElementAccessExpression,
	type FunctionDeclaration,
	type MethodDeclaration,
	type Node,
	type NumericLiteral,
	Project,
	type SourceFile,
	SyntaxKind,
	type TemplateExpression,
	type TupleTypeNode,
	type VariableDeclaration,
} from 'ts-morph';

export type TSInput = {
	tsConfigFilePath: string | string[];
	exclude?: string[];
	algorithmicPatterns?: AlgorithmicPattern[];
};

const DEFAULT_EXCLUDE_PATTERNS = ['**/*.test.ts', '**/*.spec.ts'];

const packageNameCache = new Map<string, string | null>();

function inferContext(parentKind: string | undefined): ConstantContext {
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
}

function toProjectRelativePath(projectRoot: string, filePath: string): string {
	return relative(projectRoot, filePath).replace(/\\/g, '/');
}

function resolvePackageName(filePath: string): string | null {
	let dir = dirname(filePath);
	const visited: string[] = [];

	while (true) {
		if (packageNameCache.has(dir)) {
			const cached = packageNameCache.get(dir) ?? null;
			for (const d of visited) {
				packageNameCache.set(d, cached);
			}

			return cached;
		}

		visited.push(dir);

		const pkgPath = resolve(dir, 'package.json');
		if (existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
				const name = typeof pkg.name === 'string' ? pkg.name : null;
				for (const d of visited) {
					packageNameCache.set(d, name);
				}
				return name;
			} catch {
				for (const d of visited) {
					packageNameCache.set(d, null);
				}
				return null;
			}
		}

		const parent = dirname(dir);
		if (parent === dir) {
			break;
		}
		dir = parent;
	}

	return null;
}

function normalizeSpecifier(specifier: string, fromAbsoluteFile: string, fromPackage: string | null): string {
	if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
		return specifier;
	}

	const absoluteDest = resolve(dirname(fromAbsoluteFile), specifier);
	const destPackage = resolvePackageName(absoluteDest);

	if (destPackage !== null && destPackage !== fromPackage) {
		return destPackage;
	}

	return specifier;
}

function collectImports(sourceFile: SourceFile, file: string, packageName: string | null): Import[] {
	const absoluteFile = sourceFile.getFilePath();

	return sourceFile.getImportDeclarations().map((decl) => ({
		file,
		packageName,
		specifier: normalizeSpecifier(decl.getModuleSpecifierValue(), absoluteFile, packageName),
		location: {
			file,
			line: decl.getStartLineNumber(),
			column: decl.getStartLinePos(),
		},
	}));
}

function collectConstants(sourceFile: SourceFile, file: string): Constant[] {
	const constants: Constant[] = [];

	for (const node of sourceFile.getDescendants()) {
		const kind = node.getKindName();
		const raw = node.getText();
		const context = inferContext(node.getParent()?.getKindName());
		const location: Constant['location'] = {
			file,
			line: node.getStartLineNumber(),
			column: node.getStartLinePos(),
		};

		if (kind === 'StringLiteral' && context !== 'import') {
			constants.push({
				kind: 'string',
				value: raw.slice(1, -1),
				raw,
				context,
				location,
			});
		} else if (kind === 'NumericLiteral') {
			constants.push({ kind: 'number', value: raw, raw, context, location });
		}
	}

	return constants;
}

function collectFunctionSignatures(sourceFile: SourceFile, file: string): FunctionSignature[] {
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
			functionName: func.getName() ?? 'anonymous',
			parameters,
			heterogeneousTypes: typeSet.size > 1,
			location: {
				file,
				line: func.getStartLineNumber(),
				column: func.getStartLinePos(),
			},
			isExported: func.isExported(),
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
				functionName: `${classDecl.getName()}.${method.getName()}`,
				parameters,
				heterogeneousTypes: typeSet.size > 1,
				location: {
					file,
					line: method.getStartLineNumber(),
					column: method.getStartLinePos(),
				},
				isExported: isMethodExported,
			});
		}
	}

	return signatures;
}

const POSITIONAL_API_CALLS = ['split', 'match', 'matchAll', 'Object.values', 'Object.entries'];

function isPositionalApiCall(callExpr: string): boolean {
	return POSITIONAL_API_CALLS.some((api) => callExpr.endsWith(`.${api}`) || callExpr === api);
}

function collectPositionalSources(sourceFile: SourceFile, file: string): PositionalSource[] {
	const sources: PositionalSource[] = [];

	for (const func of sourceFile.getFunctions()) {
		const returnTypeNode = func.getReturnTypeNode();
		if (returnTypeNode && returnTypeNode.getKind() === SyntaxKind.TupleType) {
			const tupleNode = returnTypeNode as TupleTypeNode;
			const elements = tupleNode.getElements();
			const positions = elements.map((el: { getText: () => string }, i: number) => ({
				index: i,
				type: el.getText(),
			}));
			const typeSet = new Set(positions.map((p) => p.type));

			sources.push({
				file,
				variableName: func.getName() ?? 'anonymous',
				positions,
				isHeterogeneous: typeSet.size > 1,
				location: {
					file,
					line: func.getStartLineNumber(),
					column: func.getStartLinePos(),
				},
				callSites: [],
			});
		} else {
			const returnStatements = func.getDescendantsOfKind(SyntaxKind.ReturnStatement);
			for (const ret of returnStatements) {
				const expression = ret.getExpression();
				if (expression && expression.getKind() === SyntaxKind.ArrayLiteralExpression) {
					const arrayExpr = expression as ArrayLiteralExpression;
					const elements = arrayExpr.getElements();
					const positions = elements.map((el, i: number) => {
						const type = el.getType().getText(el);
						return { index: i, type };
					});
					const typeSet = new Set(positions.map((p) => p.type));

					sources.push({
						file,
						variableName: func.getName() ?? 'anonymous',
						positions,
						isHeterogeneous: typeSet.size > 1,
						location: {
							file,
							line: func.getStartLineNumber(),
							column: func.getStartLinePos(),
						},
						callSites: [],
					});
					break;
				}
			}
		}
	}

	for (const classDecl of sourceFile.getClasses()) {
		for (const method of classDecl.getMethods()) {
			const returnTypeNode = method.getReturnTypeNode();
			if (returnTypeNode && returnTypeNode.getKind() === SyntaxKind.TupleType) {
				const tupleNode = returnTypeNode as TupleTypeNode;
				const elements = tupleNode.getElements();
				const positions = elements.map((el: { getText: () => string }, i: number) => ({
					index: i,
					type: el.getText(),
				}));
				const typeSet = new Set(positions.map((p) => p.type));

				sources.push({
					file,
					variableName: `${classDecl.getName()}.${method.getName()}`,
					positions,
					isHeterogeneous: typeSet.size > 1,
					location: {
						file,
						line: method.getStartLineNumber(),
						column: method.getStartLinePos(),
					},
					callSites: [],
				});
			}
		}
	}

	for (const varDecl of sourceFile.getVariableDeclarations()) {
		const initializer = varDecl.getInitializer();
		if (initializer && initializer.getKind() === SyntaxKind.ArrayLiteralExpression) {
			const arrayExpr = initializer as ArrayLiteralExpression;
			const elements = arrayExpr.getElements();
			const positions = elements.map((el, i: number) => {
				const type = el.getType().getBaseTypeOfLiteralType().getText(el);
				return { index: i, type };
			});
			const typeSet = new Set(positions.map((p) => p.type));

			sources.push({
				file,
				variableName: varDecl.getName(),
				positions,
				isHeterogeneous: typeSet.size > 1,
				location: {
					file,
					line: varDecl.getStartLineNumber(),
					column: varDecl.getStartLinePos(),
				},
				callSites: [],
			});
		}
	}

	for (const varDecl of sourceFile.getVariableDeclarations()) {
		const initializer = varDecl.getInitializer();
		if (initializer && initializer.getKind() === SyntaxKind.AsExpression) {
			const asExpr = initializer as AsExpression;
			const typeNode = asExpr.getTypeNode();
			if (typeNode && typeNode.getKind() === SyntaxKind.TupleType) {
				const tupleNode = typeNode as TupleTypeNode;
				const elements = tupleNode.getElements();
				const positions = elements.map((el, i: number) => ({
					index: i,
					type: el.getText(),
				}));
				const typeSet = new Set(positions.map((p) => p.type));

				sources.push({
					file,
					variableName: varDecl.getName(),
					positions,
					isHeterogeneous: typeSet.size > 1,
					location: {
						file,
						line: varDecl.getStartLineNumber(),
						column: varDecl.getStartLinePos(),
					},
					callSites: [],
				});
			}
		}
	}

	for (const varDecl of sourceFile.getVariableDeclarations()) {
		const initializer = varDecl.getInitializer();
		if (initializer && initializer.getKind() === SyntaxKind.CallExpression) {
			const callNode = initializer as CallExpression;
			const callExpr = callNode.getExpression();
			const calledName = callExpr.getText();
			const source = sources.find((s) => s.variableName === calledName);
			if (source) {
				sources.push({
					file,
					variableName: varDecl.getName(),
					positions: source.positions,
					isHeterogeneous: source.isHeterogeneous,
					location: {
						file,
						line: varDecl.getStartLineNumber(),
						column: varDecl.getStartLinePos(),
					},
					callSites: [],
				});
			} else if (isPositionalApiCall(calledName)) {
				sources.push({
					file,
					variableName: varDecl.getName(),
					positions: [{ index: 0, type: 'unknown' }],
					isHeterogeneous: false,
					location: {
						file,
						line: varDecl.getStartLineNumber(),
						column: varDecl.getStartLinePos(),
					},
					callSites: [],
				});
			}
		}
	}

	return sources;
}

function collectPositionalAccesses(sourceFile: SourceFile, file: string): PositionalAccess[] {
	const accesses: PositionalAccess[] = [];

	for (const node of sourceFile.getDescendants()) {
		if (node.getKind() === SyntaxKind.ElementAccessExpression) {
			const accessExpr = node as ElementAccessExpression;
			const argument = accessExpr.getArgumentExpression();
			if (argument) {
				const expression = accessExpr.getExpression();
				const variableName = expression.getText();

				if (argument.getKind() === SyntaxKind.NumericLiteral) {
					const numericArg = argument as NumericLiteral;
					accesses.push({
						file,
						variableName,
						accessedIndex: parseInt(numericArg.getLiteralText(), 10),
						accessKind: 'index',
						location: {
							file,
							line: node.getStartLineNumber(),
							column: node.getStartLinePos(),
						},
					});
				} else {
					accesses.push({
						file,
						variableName,
						accessedIndex: argument.getText(),
						accessKind: 'index',
						location: {
							file,
							line: node.getStartLineNumber(),
							column: node.getStartLinePos(),
						},
					});
				}
			}
		}
	}

	for (const varDecl of sourceFile.getVariableDeclarations()) {
		const nameNode = varDecl.getNameNode();
		if (nameNode && nameNode.getKind() === SyntaxKind.ArrayBindingPattern) {
			const bindingPattern = nameNode as ArrayBindingPattern;
			const initializer = varDecl.getInitializer();
			if (initializer) {
				let variableName = initializer.getText();
				if (variableName.endsWith('()')) {
					variableName = variableName.slice(0, -2);
				}
				const elements = bindingPattern.getElements();

				for (let i = 0; i < elements.length; i++) {
					accesses.push({
						file,
						variableName,
						accessedIndex: i,
						accessKind: 'destructuring',
						location: {
							file,
							line: varDecl.getStartLineNumber(),
							column: varDecl.getStartLinePos(),
						},
					});
				}
			}
		}
	}

	return accesses;
}

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
			if (classDecl && classDecl.getKind() === SyntaxKind.ClassDeclaration) {
				return `${(classDecl as ClassDeclaration).getName()}.${method.getName()}`;
			}
			return method.getName();
		}
		if (kind === SyntaxKind.ArrowFunction) {
			const parent = current.getParent();
			if (parent && parent.getKind() === SyntaxKind.VariableDeclaration) {
				return (parent as VariableDeclaration).getName();
			}
			return 'arrow';
		}
		current = current.getParent();
	}
	return null;
}

function collectAlgorithmicBindings(
	sourceFile: SourceFile,
	file: string,
	patterns: AlgorithmicPattern[],
): AlgorithmicBinding[] {
	const bindings: AlgorithmicBinding[] = [];
	if (patterns.length === 0) {
		return bindings;
	}

	for (const pattern of patterns) {
		for (const matcher of pattern.matchers) {
			const expressionKind = matcher.expressionKind ?? 'call';
			const functionRegex = new RegExp(matcher.functionPattern);

			if (expressionKind === 'template') {
				for (const node of sourceFile.getDescendants()) {
					if (node.getKind() === SyntaxKind.TemplateExpression) {
						const templateNode = node as TemplateExpression;
						const spans = templateNode.getTemplateSpans();
						const segments: string[] = [];

						// Head: "`text${"  → extract text between backtick and "${"
						const headText = templateNode.getHead().getText();
						const headLiteral = headText.slice(1, -2);
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
							// Tail:   "}text`" → slice(1, -1) removes "}" and "`"
							const text = isLast ? literalText.slice(1, -1) : literalText.slice(1, -2);
							if (text.length > 0 && !(isLast && /^(\s|\\[ntrfv0])+$/.test(text))) {
								segments.push(text);
							}
						}

						for (const segment of segments) {
							bindings.push({
								patternId: pattern.id,
								role: matcher.role,
								bindingKey: segment,
								functionName: 'template-literal',
								file,
								location: {
									file,
									line: node.getStartLineNumber(),
									column: node.getStartLinePos(),
								},
								containingFunction: getContainingFunctionName(templateNode),
							});
						}
					}
				}
			} else {
				for (const node of sourceFile.getDescendants()) {
					if (node.getKind() !== SyntaxKind.CallExpression) {
						continue;
					}

					const callNode = node as CallExpression;
					const expression = callNode.getExpression();
					const calledName = expression.getText();

					if (!functionRegex.test(calledName)) {
						continue;
					}

					if (matcher.literalArgIndex !== undefined) {
						const args = callNode.getArguments();
						const arg = args[matcher.literalArgIndex];
						if (arg && arg.getKind() === SyntaxKind.StringLiteral) {
							const raw = arg.getText();
							const value = raw.slice(1, -1);

							bindings.push({
								patternId: pattern.id,
								role: matcher.role,
								bindingKey: value,
								functionName: calledName,
								file,
								location: {
									file,
									line: node.getStartLineNumber(),
									column: node.getStartLinePos(),
								},
								containingFunction: getContainingFunctionName(callNode),
							});
						}
					} else {
						// No literal argument required; bind to an empty key
						bindings.push({
							patternId: pattern.id,
							role: matcher.role,
							bindingKey: '',
							functionName: calledName,
							file,
							location: {
								file,
								line: node.getStartLineNumber(),
								column: node.getStartLinePos(),
							},
							containingFunction: getContainingFunctionName(callNode),
						});
					}
				}
			}
		}
	}

	return bindings;
}

export class TSCollector
	implements
		Collector<
			| 'constants'
			| 'imports'
			| 'functionSignatures'
			| 'positionalSources'
			| 'positionalAccesses'
			| 'algorithmicBindings'
		>
{
	public readonly id = 'ts';
	public readonly provideFacts = [
		CONSTANTS_CAPABILITY,
		IMPORTS_CAPABILITY,
		FUNCTION_SIGNATURES_CAPABILITY,
		POSITIONAL_SOURCES_CAPABILITY,
		POSITIONAL_ACCESSES_CAPABILITY,
		ALGORITHMIC_BINDINGS_CAPABILITY,
	] as const;

	public constructor(private readonly config: TSInput) {}

	private async expandGlobs(patterns: string[], rootDir: string): Promise<string[]> {
		const results: string[] = [];
		for (const pattern of patterns) {
			if (/[*?{[]/.test(pattern)) {
				const matches = await glob(pattern, { cwd: rootDir, absolute: true });
				results.push(...matches);
			} else {
				results.push(resolve(pattern));
			}
		}

		return results;
	}

	public async collect(): Promise<
		Pick<
			FactRegistry,
			| 'constants'
			| 'imports'
			| 'functionSignatures'
			| 'positionalSources'
			| 'positionalAccesses'
			| 'algorithmicBindings'
		>
	> {
		const rawPatterns = Array.isArray(this.config.tsConfigFilePath)
			? this.config.tsConfigFilePath
			: [this.config.tsConfigFilePath];

		const projectRoot = process.cwd();
		const tsConfigPaths = await this.expandGlobs(rawPatterns, projectRoot);

		const excludePatterns = this.config.exclude ?? DEFAULT_EXCLUDE_PATTERNS;
		const algorithmicPatterns = this.config.algorithmicPatterns ?? [];
		const seenFiles = new Set<string>();
		const constants: Constant[] = [];
		const imports: Import[] = [];
		const functionSignatures: FunctionSignature[] = [];
		const positionalSources: PositionalSource[] = [];
		const positionalAccesses: PositionalAccess[] = [];
		const algorithmicBindings: AlgorithmicBinding[] = [];
		const sourceFiles: SourceFile[] = [];
		const fileMap = new Map<SourceFile, string>();

		for (const tsConfigPath of tsConfigPaths) {
			const project = new Project({ tsConfigFilePath: tsConfigPath });

			for (const sourceFile of project.getSourceFiles()) {
				const absoluteFile = sourceFile.getFilePath();
				if (seenFiles.has(absoluteFile)) {
					continue;
				}
				seenFiles.add(absoluteFile);

				const file = toProjectRelativePath(projectRoot, absoluteFile);
				if (micromatchIsMatch(file, excludePatterns)) {
					continue;
				}

				const packageName = resolvePackageName(absoluteFile);
				imports.push(...collectImports(sourceFile, file, packageName));
				constants.push(...collectConstants(sourceFile, file));
				functionSignatures.push(...collectFunctionSignatures(sourceFile, file));
				positionalSources.push(...collectPositionalSources(sourceFile, file));
				positionalAccesses.push(...collectPositionalAccesses(sourceFile, file));
				algorithmicBindings.push(...collectAlgorithmicBindings(sourceFile, file, algorithmicPatterns));
				sourceFiles.push(sourceFile);
				fileMap.set(sourceFile, file);
			}
		}

		for (const source of positionalSources) {
			const funcName = source.variableName;
			for (const sf of sourceFiles) {
				const file = fileMap.get(sf);
				if (!file) {
					continue;
				}

				for (const varDecl of sf.getVariableDeclarations()) {
					const initializer = varDecl.getInitializer();
					if (initializer && initializer.getKind() === SyntaxKind.CallExpression) {
						const callNode = initializer as CallExpression;
						const callExpr = callNode.getExpression();
						const calledName = callExpr.getText();
						if (calledName === funcName || calledName.endsWith(`.${funcName}`)) {
							source.callSites.push({
								file,
								variableName: varDecl.getName(),
								location: {
									file,
									line: varDecl.getStartLineNumber(),
									column: varDecl.getStartLinePos(),
								},
							});
						}
					}
				}
			}
		}

		return { constants, imports, functionSignatures, positionalSources, positionalAccesses, algorithmicBindings };
	}
}

declare module '@maat-tools/contracts' {
	interface FactRegistry {
		imports: Import[];
		constants: Constant[];
	}
	interface CollectorRegistry {
		'@maat-tools/collector-ts': TSInput;
	}
}

export default defineCollector((config: TSInput) => new TSCollector(config));
