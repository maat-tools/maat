import '@maat-tools/contracts';

export const CONSTANTS_CAPABILITY = 'constants' as const;
export const IMPORTS_CAPABILITY = 'imports' as const;
export const FUNCTION_SIGNATURES_CAPABILITY = 'functionSignatures' as const;

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

declare module '@maat-tools/contracts' {
	interface FactRegistry {
		constants: Constant[];
		imports: Import[];
		functionSignatures: FunctionSignature[];
	}
}
