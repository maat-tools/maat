import { greet, UserService } from './user';

const service = new UserService('admin');

service.addUser({ id: 1, name: 'Alice', email: 'alice@example.com' });
service.addUser({ id: 2, name: 'Bob', email: 'bob@example.com' });

const alice = service.findById(1);
if (alice) {
	console.log(greet(alice));
}

export function sendEmail(firstName: string, lastName: string, email: string, subject: string, body: string): void {}

export function createUser(name: string, email: string, age: number, isAdmin: boolean, isActive: boolean): void {}
