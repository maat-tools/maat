// Same-package relative import — specifier must stay as-is

// Cross-package relative import — specifier must be rewritten to '@fixture/pkg-b'
import { world } from '../../pkg-b/src/index';
import { hello } from './helper';

export const greeting = `${hello} ${world}`;
