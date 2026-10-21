import assert from "node:assert/strict";
import test from "node:test";
import { FIXTURES } from "./index.ts";
import { validateFixtureRegistry, withDependencies } from "./registry.ts";
import type { Fixture } from "./types.ts";

const ids = (fixtures: Fixture[]) => fixtures.map((fixture) => fixture.id);

const fixture = (id: string, dependsOn?: string[]): Fixture => ({
  id,
  description: id,
  version: 1,
  dependsOn,
  async up() {},
  async check() {},
});

test("the fixture registry is valid", () => {
  assert.doesNotThrow(() => validateFixtureRegistry(FIXTURES));
});

test("dependencies are loaded before the requested fixture", () => {
  const invoices = FIXTURES.find((candidate) => candidate.id === "invoices:alejandro")!;

  assert.deepEqual(ids(withDependencies([invoices], FIXTURES)), [
    "users:alejandro",
    "clients:alejandro",
    "invoices:alejandro",
  ]);
});

test("invalid registries are rejected", () => {
  assert.throws(() => validateFixtureRegistry([fixture("a:a"), fixture("a:a")]), /Duplicate fixture id/);
  assert.throws(() => validateFixtureRegistry([fixture("no-area")]), /namespaced by area/);
  assert.throws(
    () => validateFixtureRegistry([fixture("a:a", ["a:missing"])]),
    /unknown fixture a:missing/,
  );
  assert.throws(
    () => validateFixtureRegistry([fixture("a:a", ["a:b"]), fixture("a:b", ["a:a"])]),
    /Circular fixture dependency/,
  );
});
