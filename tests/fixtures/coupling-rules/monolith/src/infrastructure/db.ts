// This file is outside the ./monolith/src/domain/** target.
// Its imports must never appear as findings from the domain rule.
import { readFileSync } from 'node:fs';

export const db = () => readFileSync('data.json', 'utf-8');
