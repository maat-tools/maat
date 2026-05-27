// Relative cross-package import that resolves to @fixture/shared — NOT allowed.
// The collector normalizes ../../pkg-shared/src/index to @fixture/shared.
import { shared } from '../../pkg-shared/src/index';

export { shared };
