import { getUserDetails } from './positional';

// Cross-file positional access
const remoteUser = getUserDetails();
const isAdmin = remoteUser[3];
const [first, last] = getUserDetails();
