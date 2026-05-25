import '@maat-tools/contracts';

export const CONSTANTS_CAPABILITY = 'constants' as const;
export const IMPORTS_CAPABILITY = 'imports' as const;
export const FUNCTION_SIGNATURES_CAPABILITY = 'functionSignatures' as const;
export const POSITIONAL_SOURCES_CAPABILITY = 'positionalSources' as const;
export const POSITIONAL_ACCESSES_CAPABILITY = 'positionalAccesses' as const;
export const FUNCTION_CONTRACTS_CAPABILITY = 'functionContracts' as const;
export const ALGORITHMIC_BINDINGS_CAPABILITY = 'algorithmicBindings' as const;

export type ConstantContext = 'argument' | 'assignment' | 'return' | 'condition' | 'import' | 'decorator' | 'other';

export type SourceLocation = {
	file: string;
	line: number;
	column?: number;
};

export type Constant = {
	kind: 'string' | 'number';
	value: string;
	raw: string;
	context: ConstantContext;
	location: SourceLocation;
};

export type Import = {
	file: string;
	packageName: string | null;
	specifier: string;
	location: SourceLocation;
};

export type Parameter = {
	name: string;
	type: string;
	position: number;
};

export type FunctionSignature = {
	file: string;
	functionName: string;
	parameters: Parameter[];
	heterogeneousTypes: boolean;
	location: SourceLocation;
	isExported: boolean;
};

export type PositionalSource = {
	file: string;
	variableName: string;
	positions: { index: number; type: string }[];
	isHeterogeneous: boolean;
	location: SourceLocation;
};

export type PositionalAccess = {
	file: string;
	variableName: string;
	accessedIndex: number | string;
	accessKind: 'index' | 'destructuring';
	location: SourceLocation;
};

export type PropertyAccess = {
	propertyName: string;
	objectName: string;
	isWrite: boolean;
};

export type FunctionContract = {
	file: string;
	functionName: string;
	container: string | null;
	parameters: Parameter[];
	returnType: string;
	accessedProperties: PropertyAccess[];
	calledFunctions: string[];
	location: SourceLocation;
	isExported: boolean;
};

export const CALL_GRAPH_CAPABILITY = 'callGraph' as const;

export type CallNodeKind = 'function' | 'method' | 'arrow' | 'class' | 'module';

export type CallNode = {
	id: string;
	file: string;
	name: string;
	kind: CallNodeKind;
	location: SourceLocation;
};

export type CallEdge = {
	callerId: string;
	calleeId: string;
	location: SourceLocation;
};

export type CallGraph = {
	nodes: CallNode[];
	edges: CallEdge[];
};

export type AlgorithmicPatternMatcher = {
	role: string;
	functionPattern: string;
	literalArgIndex?: number;
	expressionKind?: 'call' | 'template';
};

export type AlgorithmicPattern = {
	id: string;
	roles: string[];
	matchers: AlgorithmicPatternMatcher[];
};

export type AlgorithmicBinding = {
	patternId: string;
	role: string;
	bindingKey: string;
	functionName: string;
	file: string;
	location: SourceLocation;
	containingFunction: string | null;
};

declare module '@maat-tools/contracts' {
	interface FactRegistry {
		constants: Constant[];
		imports: Import[];
		functionSignatures: FunctionSignature[];
		positionalSources: PositionalSource[];
		positionalAccesses: PositionalAccess[];
		functionContracts: FunctionContract[];
		algorithmicBindings: AlgorithmicBinding[];
		callGraph: CallGraph;
	}
}
