import type { Fixture } from "./types.ts";

export function validateFixtureRegistry(fixtures: Fixture[]) {
  const byId = new Map<string, Fixture>();

  for (const fixture of fixtures) {
    if (!/^[a-z0-9-]+:[a-z0-9-]+$/.test(fixture.id)) {
      throw new Error(`Fixture id must be namespaced by area: ${fixture.id}`);
    }
    if (!Number.isInteger(fixture.version) || fixture.version < 1) {
      throw new Error(`Fixture version must be a positive integer: ${fixture.id}`);
    }
    if (byId.has(fixture.id)) throw new Error(`Duplicate fixture id: ${fixture.id}`);
    byId.set(fixture.id, fixture);
  }

  for (const fixture of fixtures) withDependencies([fixture], fixtures);
}

/** The selected fixtures preceded by their dependencies, in load order. */
export function withDependencies(selected: Fixture[], fixtures: Fixture[]) {
  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const ordered: Fixture[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (fixture: Fixture, trail: string[]) => {
    if (visited.has(fixture.id)) return;
    if (visiting.has(fixture.id)) {
      throw new Error(
        `Circular fixture dependency: ${[...trail, fixture.id].join(" -> ")}`,
      );
    }

    visiting.add(fixture.id);
    for (const dependencyId of fixture.dependsOn ?? []) {
      const dependency = byId.get(dependencyId);

      if (!dependency) {
        throw new Error(`Fixture ${fixture.id} depends on unknown fixture ${dependencyId}`);
      }
      visit(dependency, [...trail, fixture.id]);
    }
    visiting.delete(fixture.id);
    visited.add(fixture.id);
    ordered.push(fixture);
  };

  selected.forEach((fixture) => visit(fixture, []));

  return ordered;
}
