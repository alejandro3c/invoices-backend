import { isDeepStrictEqual } from "node:util";

export function requireValue<T>(value: T | null | undefined, description: string): T {
  if (value == null) throw new Error(`Expected ${description}`);

  return value;
}

export function requireEqual(actual: unknown, expected: unknown, description: string) {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(
      `${description}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

/** Every expected id is present; extra ids, such as data created from the app, are allowed. */
export function requireIncludesIds(actual: string[], expected: string[], description: string) {
  const missing = expected.filter((id) => !actual.includes(id));

  if (missing.length > 0) {
    throw new Error(`${description}: missing [${missing.join(", ")}]`);
  }
}
