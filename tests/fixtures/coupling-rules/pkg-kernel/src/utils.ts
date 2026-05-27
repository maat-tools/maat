// VIOLATION: @fixture/core is not in @fixture/kernel's allows list
import { value } from '@fixture/core';

export const helper = () => String(value);
