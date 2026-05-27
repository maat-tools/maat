// allowed: resolves to monolith/src/shared/auth — matches ./monolith/src/shared/**

// VIOLATION: resolves to monolith/src/infrastructure/db — not in allows
import { db } from '../../infrastructure/db';
import { auth } from '../../shared/auth';

export { auth, db };
