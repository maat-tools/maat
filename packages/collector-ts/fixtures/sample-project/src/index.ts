import { greet, UserService } from './user';

const service = new UserService('admin');

service.addUser({ id: 1, name: 'Alice', email: 'alice@example.com' });
service.addUser({ id: 2, name: 'Bob', email: 'bob@example.com' });

const alice = service.findById(1);
if (alice) {
	console.log(greet(alice));
}
