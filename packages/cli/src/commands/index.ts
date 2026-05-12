export interface MaatCommand {
	action(...args: unknown[]): Promise<void>;
	register(): void;
}
