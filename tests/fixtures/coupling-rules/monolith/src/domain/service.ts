// allowed: ./ import — same directory, always skipped

// VIOLATION: lodash is a package not in the allows list
import _ from 'lodash';
// allowed: react is explicitly in the allows list
import React from 'react';
// VIOLATION: resolves to monolith/src/infrastructure/db — not in allows
import { db } from '../infrastructure/db';
// allowed: resolves to monolith/src/shared/auth — matches ./monolith/src/shared/**
import { auth } from '../shared/auth';
import { greet } from './helper';

export { _, auth, db, greet, React };
