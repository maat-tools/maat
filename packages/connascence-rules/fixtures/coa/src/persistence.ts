import { readFileSync, writeFileSync } from 'node:fs';

export function loadConfig(path: string): string {
	return readFileSync(path, 'utf-8');
}

export function saveConfig(path: string, data: string): void {
	return writeFileSync(path, data, 'utf-8');
}
