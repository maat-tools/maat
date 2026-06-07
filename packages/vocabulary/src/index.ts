import '@maat-tools/contracts';

export const DEPENDS_ON_CAPABILITY = 'dependsOn' as const;
export const PACKAGES_CAPABILITY = 'packages' as const;
export const FUNCTION_SIGNATURES_CAPABILITY = 'functionSignatures' as const;
export const CALL_GRAPH_CAPABILITY = 'callGraph' as const;
export const CONSTANTS_CAPABILITY = 'constants' as const;
export const ALGORITHMIC_BINDINGS_CAPABILITY = 'algorithmicBindings' as const;
export const POSITIONAL_SOURCES_CAPABILITY = 'positionalSources' as const;
export const POSITIONAL_ACCESSES_CAPABILITY = 'positionalAccesses' as const;

export type SourceLocation = {
	file: string;
	line: number;
	column?: number;
};

export type DependsOn = {
	from: {
		path: string;
		package?: {
			name: string;
			rootPath: string;
		};
		location: SourceLocation;
	};
	to: {
		path: string;
		isExternal: boolean;
		package?: {
			name: string;
			rootPath?: string;
		};
	};
};

export type Package = {
	name: string;
	rootPath: string;
};

export type Parameter = {
	name: string;
	type: string;
	position: number;
};

export type ReturnSite = {
	value: string;
	location: SourceLocation;
	guardSnippet?: string;
};

export type FunctionSignature = {
	file: string;
	name: string;
	input: {
		parameters: Parameter[];
		heterogeneous: boolean;
	},
	output: {
		returnType: string;
		heterogeneous: boolean;
		returnSites: ReturnSite[];
	},
	location: SourceLocation;
	exported: boolean;
};

export type CallNodeKind = 'function' | 'method' | 'class' | 'module';

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

export type ConstantContext = 'argument' | 'assignment' | 'return' | 'condition' | 'other';

export type Constant = {
	file: string;
	kind: 'string' | 'number';
	value: string;
	location: SourceLocation;
};

export type AlgorithmicPatternMatcher = {
	role: string;
	functionPattern: string;
	literalArgIndex?: number;
	expressionKind?: 'template';
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

export type PositionalSource = {
	file: string;
	name: string;
	type: 'function' | 'variable';
	positions: { index: number; type: string }[];
	isHeterogeneous: boolean;
	location: SourceLocation;
};

export type PositionalAccess = {
	file: string;
	name: string;
	type: 'function' | 'variable';
	accessedIndex: number | string;
	accessKind: 'index' | 'destructuring';
	origin?: { file: string; name: string };
	location: SourceLocation;
};

declare module '@maat-tools/contracts' {
	interface FactRegistry {
		dependsOn: DependsOn[];
		packages: Package[];
		functionSignatures: FunctionSignature[];
		callGraph: CallGraph;
		constants: Constant[];
		algorithmicBindings: AlgorithmicBinding[];
		positionalSources: PositionalSource[];
		positionalAccesses: PositionalAccess[];
	}
}
