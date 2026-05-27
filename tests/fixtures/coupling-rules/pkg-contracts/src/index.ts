import { createHash } from 'node:crypto';

export const hash = (s: string) => createHash('sha256').update(s).digest('hex');

export type ContractId = { id: string };
