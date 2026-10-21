import { createFixtureContext, getLoadedFixtures, markFixtureLoaded } from "./context.ts";
import { clearEmulators, useLocalEmulators } from "./emulators.ts";
import { FIXTURES, findFixture } from "./index.ts";
import { validateFixtureRegistry, withDependencies } from "./registry.ts";
import type { Fixture } from "./types.ts";

const USAGE = `
Development fixtures: the local emulators are emptied and loaded with these scenarios.

Usage:
  npm run fixtures                         empty the emulators and load every scenario
  npm run fixtures -- <id> [<id>...]       empty them and load only these, with their dependencies
  npm run fixtures -- --list               registered scenarios and which are loaded
  npm run fixtures -- --check [<id>...]    check the loaded scenarios
  npm run fixtures -- <id> --no-check      load without checking
`;

type Options = {
  help: boolean;
  list: boolean;
  checkOnly: boolean;
  noCheck: boolean;
  ids: string[];
};

function writeLine(message = "") {
  process.stdout.write(`${message}\n`);
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    help: false,
    list: false,
    checkOnly: false,
    noCheck: false,
    ids: [],
  };

  for (const argument of args) {
    if (argument === "--help") options.help = true;
    else if (argument === "--list") options.list = true;
    else if (argument === "--check") options.checkOnly = true;
    else if (argument === "--no-check") options.noCheck = true;
    else if (argument.startsWith("--")) throw new Error(`Unknown option: ${argument}`);
    else options.ids.push(argument);
  }

  return options;
}

function resolveFixtures(ids: string[]) {
  if (ids.length === 0) return FIXTURES;

  return ids.map((id) => {
    const fixture = findFixture(id);

    if (!fixture) throw new Error(`Unknown fixture: ${id}`);
    return fixture;
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function runChecks(fixtures: Fixture[]) {
  writeLine("\nChecking scenarios:");
  const context = createFixtureContext();
  const failed: string[] = [];

  for (const fixture of fixtures) {
    try {
      await fixture.check(context);
      writeLine(`  OK   ${fixture.id}`);
    } catch (error) {
      failed.push(fixture.id);
      writeLine(`  FAIL ${fixture.id}: ${errorMessage(error)}`);
    }
  }

  if (failed.length > 0) throw new Error(`Fixture checks failed: ${failed.join(", ")}`);
}

async function run() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    writeLine(USAGE);
    return;
  }

  validateFixtureRegistry(FIXTURES);

  // The emulator variables must be set before the Admin SDK is first used
  const emulators = useLocalEmulators();

  writeLine(`\nFirestore emulator: ${emulators.firestore}`);
  writeLine(`Auth emulator:      ${emulators.auth}`);
  writeLine(`Storage emulator:   ${emulators.storage}`);

  const loaded = await getLoadedFixtures();

  if (options.list) {
    writeLine("\nRegistered scenarios:\n");
    for (const fixture of FIXTURES) {
      const state = loaded.find((candidate) => candidate.fixtureId === fixture.id);
      const label = !state ? "" : state.version !== fixture.version ? "OUTDATED" : "LOADED";
      const dependencies = fixture.dependsOn?.length
        ? ` (depends on: ${fixture.dependsOn.join(", ")})`
        : "";

      writeLine(`  [${label.padEnd(8)}] ${fixture.id}`);
      writeLine(`             ${fixture.description}${dependencies}`);
    }
    writeLine();
    return;
  }

  const selected = resolveFixtures(options.ids);

  if (options.checkOnly) {
    const loadedIds = new Set(loaded.map((state) => state.fixtureId));

    selected
      .filter((fixture) => !loadedIds.has(fixture.id))
      .forEach((fixture) => writeLine(`- ${fixture.id} is not loaded; skipping`));
    await runChecks(selected.filter((fixture) => loadedIds.has(fixture.id)));
    writeLine("\nAll loaded scenarios passed.\n");
    return;
  }

  const plan = withDependencies(selected, FIXTURES);

  writeLine("\n- Emptying Firestore, Auth and Storage");
  await clearEmulators();

  const context = createFixtureContext();

  for (const fixture of plan) {
    writeLine(`+ Loading ${fixture.id}`);
    await fixture.up(context);
    await markFixtureLoaded(fixture);
  }

  if (!options.noCheck) await runChecks(plan);
  writeLine("\nFixtures loaded.\n");
}

run().then(
  () => process.exit(),
  (error) => {
    writeLine(`\nFixture command failed: ${errorMessage(error)}`);
    process.exit(1);
  },
);
