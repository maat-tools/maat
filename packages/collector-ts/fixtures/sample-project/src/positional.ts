// Positional source: function returning an array (heterogeneous)
export function getUserDetails(): [string, string, number, boolean] {
	return ["Thomas", "Richards", 1984, true];
}

// Positional source: function WITHOUT explicit return type
function getUserDetailsImplicit() {
	return ["Thomas", "Richards", 1984, true];
}

// Positional source: variable assigned array literal
const config = ["admin", 8080, true];

// Positional access: index access
const user = getUserDetails();
const isAdmin = user[3];
const firstName = user[0];

// Positional access: array destructuring
const [first, last, birthYear, admin] = getUserDetails();

// Positional access: destructuring from variable
const [role, port, secure] = config;

// Named access (should NOT be flagged as positional)
const namedUser = { firstName: "Thomas", lastName: "Richards", isAdmin: true };
const adminStatus = namedUser.isAdmin;

// Function returning named object (should NOT be a positional source)
function getUserObject() {
	return { firstName: "Thomas", lastName: "Richards", yearOfBirth: 1984, isAdmin: true };
}

// Known positional API: split
const dateParts = "2024-03-15".split("-");
const year = dateParts[0];

// Known positional API: Object.values
const values = Object.values({ a: 1, b: 2, c: 3 });
const firstObjectValue = values[0];

// Known positional API: match
const matchResult = "hello world".match(/(\w+) (\w+)/);
const firstGroup = matchResult?.[1];

// Known positional API: Object.entries with destructuring
const entries = Object.entries({ a: 1, b: 2 });
const [firstKey, firstValue] = entries[0]!;

// Type-asserted array (AsExpression with TupleType)
const typedTuple = [1, 'hello', true] as [number, string, boolean];
const firstTyped = typedTuple[0];

// Homogeneous array with different string literals
const homogeneousStrings = ['foo', 'bar', 'baz'];
const firstHomo = homogeneousStrings[0];

// Computed index access (variable)
const idx = 1;
const secondConfig = config[idx];

// Computed index access (expression)
const offset = config[idx + 1];

// Computed index access (function call)
function getIndex() { return 2; }
const dynamicValue = config[getIndex()];

// Class method with explicit tuple return type (exercises the class-method path in the collector)
export class DataParser {
	parse(raw: string): [string, number, boolean] {
		return [raw, raw.length, raw.length > 0];
	}
}
