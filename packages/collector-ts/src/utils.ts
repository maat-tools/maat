import type { Node } from 'ts-morph';

export function makeLocation(file: string, node: Node) {
	return { file, line: node.getStartLineNumber(), column: node.getStartLinePos() };
}
