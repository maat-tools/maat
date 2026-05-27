// Imports @fixture/shared by package name.
// allows() contains './monolith/src/shared/**' (a path glob) but NOT '@fixture/shared'.
// Path globs never match package names — this is a violation.
import { shared } from '@fixture/shared';

export { shared };
