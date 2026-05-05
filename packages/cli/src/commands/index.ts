export interface MaatCommand {
	name: string;
	description: string;
	action(options?: Record<string, unknown>): Promise<void>;
	register(): void;
}
