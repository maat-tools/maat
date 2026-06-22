const ONE_SECOND_MS = 1000;
const ONE_MINUTE_MS = 60 * ONE_SECOND_MS;

export function formatElapsedTime(elapsed: number): string {
	if (elapsed < ONE_SECOND_MS) {
		return `${elapsed.toFixed(0)}ms`;
	}

	if (elapsed < ONE_MINUTE_MS) {
		return `${(elapsed / ONE_SECOND_MS).toFixed(1)}s`;
	}

	const minutes = Math.floor(elapsed / ONE_MINUTE_MS);
	const seconds = Math.round((elapsed % ONE_MINUTE_MS) / ONE_SECOND_MS);

	return `${minutes}m ${seconds}s`;
}
