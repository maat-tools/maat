import yoctoSpinner from 'yocto-spinner';

export type Spinner = ReturnType<typeof createSpinner>;

export function createSpinner() {
	if (!process.stderr.isTTY || !process.stderr.columns) {
		return null;
	}

	const spinner = yoctoSpinner({ stream: process.stderr }).start();

	return {
		update(text: string) {
			spinner.text = text;
		},
		stop() {
			spinner.stop();
		},
	};
}
