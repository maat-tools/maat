import { spyOn } from 'bun:test';

export class ExitCapture {
	code: number | undefined;
	called = false;
	private spy?: ReturnType<typeof spyOn<typeof process, 'exit'>>;

	setup(): void {
		this.code = undefined;
		this.called = false;
		this.spy = spyOn(process, 'exit').mockImplementation(((code?: number) => {
			this.called = true;
			this.code = code;
			throw new Error(`process.exit(${code ?? 0})`);
		}) as never);
	}

	teardown(): void {
		this.spy?.mockRestore();
	}

	assertExitedWith(expectedCode: number): void {
		if (!this.called) {
			throw new Error(`Expected process.exit(${expectedCode}) to be called, but it was not.`);
		}
		if (this.code !== expectedCode) {
			throw new Error(`Expected process.exit(${expectedCode}), but got process.exit(${this.code}).`);
		}
	}

	assertNotExited(): void {
		if (this.called) {
			throw new Error(`Expected process.exit not to be called, but it was called with code ${this.code}.`);
		}
	}
}
