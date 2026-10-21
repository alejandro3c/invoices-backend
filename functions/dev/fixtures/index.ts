import { clientsFixture } from "./clients/alejandro.fixture.ts";
import { invoicesFixture } from "./invoices/alejandro.fixture.ts";
import { recurringFixture } from "./recurring/alejandro.fixture.ts";
import type { Fixture } from "./types.ts";
import { alejandroUserFixture } from "./users/alejandro.fixture.ts";

export const FIXTURES: Fixture[] = [
  alejandroUserFixture,
  clientsFixture,
  invoicesFixture,
  recurringFixture,
];

export function findFixture(id: string) {
  return FIXTURES.find((fixture) => fixture.id === id);
}
