// Relative cross-package import that resolves to @fixture/contracts — allowed.
// The collector normalizes ../../pkg-contracts/src/index to @fixture/contracts.
import type { ContractId } from '../../pkg-contracts/src/index';

export type { ContractId };
