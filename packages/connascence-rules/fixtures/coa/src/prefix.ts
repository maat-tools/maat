// False positive: whitespace prefix in template literal should NOT be reported
export function printHeading(heading: string): void {
	console.log(`\n${heading}`);
}
