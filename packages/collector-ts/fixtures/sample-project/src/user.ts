export interface User {
	id: number;
	name: string;
	email: string;
}

export type Role = 'admin' | 'editor' | 'viewer';

export class UserService {
	private users: User[] = [];

	constructor(readonly _role: Role) {}

	addUser(user: User): void {
		this.users.push(user);
	}

	findById(id: number): User | undefined {
		return this.users.find((u) => u.id === id);
	}

	getAll(): User[] {
		return this.users;
	}
}

export function greet(user: User): string {
	return `Hello, ${user.name}!`;
}
