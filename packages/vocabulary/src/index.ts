export const CONSTANTS_CAPABILITY = 'constants' as const;
export const IMPORTS_CAPABILITY = 'imports' as const;

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

declare module '@maat-tools/contracts' {
	interface FactRegistry {
		constants: Constant[];
		imports: Import[];
	}
}
