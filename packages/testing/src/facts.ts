export {};

declare module '@maat-tools/contracts' {
	interface FactRegistry {
		testFacts: string[];
		otherFacts: string[];
		enrichedFacts: string[];
	}
}
