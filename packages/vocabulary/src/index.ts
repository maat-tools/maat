import type { Artifact } from '@maat/contracts';

declare module '@maat/contracts' {
	interface FactRegistry {
		constants: Constant[];
	}
}

export const CONSTANTS_CAPABILITY = 'constants' as const;

export type ConstantContext =
	| 'argument'
	| 'assignment'
	| 'return'
	| 'condition'
	| 'import'
	| 'decorator'
	| 'other';

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
