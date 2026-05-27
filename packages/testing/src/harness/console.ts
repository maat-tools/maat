import { spyOn } from 'bun:test';

type WriteSpy = ReturnType<typeof spyOn<typeof process.stdout, 'write'>>;

export class ConsoleCapture {
	private _stdout: string[] = [];
	private _stderr: string[] = [];
	private outSpy?: WriteSpy;
	private errSpy?: WriteSpy;

	public setup(): void {
		this._stdout = [];
		this._stderr = [];
		this.outSpy = spyOn(process.stdout, 'write').mockImplementation(((chunk: Uint8Array | string) => {
			this._stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
			return true;
		}) as typeof process.stdout.write);
		this.errSpy = spyOn(process.stderr, 'write').mockImplementation(((chunk: Uint8Array | string) => {
			this._stderr.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
			return true;
		}) as typeof process.stderr.write);
	}

	public teardown(): void {
		this.outSpy?.mockRestore();
		this.errSpy?.mockRestore();
	}

	public get stdout(): string {
		return this._stdout.join('');
	}

	public get stderr(): string {
		return this._stderr.join('');
	}

	public lines(): string[] {
		return this.stdout.split('\n').filter(Boolean);
	}

	public plainText(): string {
		// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape stripping
		return this.stdout.replace(/\x1b\[[0-9;]*m/g, '');
	}
}
