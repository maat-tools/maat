import type { Role } from './user';

const PERMISSIONS: Record<Role, string[]> = {
	admin: ['read', 'write', 'delete'],
	editor: ['read', 'write'],
	viewer: ['read'],
};

export function hasPermission(role: Role, action: string): boolean {
	return PERMISSIONS[role]?.includes(action) ?? false;
}

export const DEFAULT_ROLE = 'admin';
