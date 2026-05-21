// Protocol using \n as a separator between expressions (legitimate CoA)

export function formatMessage(header: string, body: string): string {
	return `${header}\n${body}`;
}

export function parseMessage(msg: string): [string, string] {
	return msg.split('\n') as [string, string];
}
