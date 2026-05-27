// False positive: whitespace suffix in template literal should NOT be reported
export function writeMessage(text: string): void {
	process.stdout.write(`${text}\n`);
}
