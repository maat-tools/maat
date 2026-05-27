// allowed: @fixture/contracts (in allows)
import { hash } from '@fixture/contracts';

// allowed: sub-path of @fixture/contracts (also covered by the same allows entry)
import type { ContractId } from '@fixture/contracts/types';

// allowed: relative, always skipped regardless of allows
import { helper } from './utils';

export type { ContractId };
export { hash, helper };
