export function serializeUser(user: { name: string; age: number }): string {
	return JSON.stringify(user);
}

export function deserializeUser(raw: string): { name: string; age: number } {
	return JSON.parse(raw);
}
