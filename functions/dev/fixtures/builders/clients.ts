import type { ClientDocument } from "../../../src/invoices/types.ts";
import type { FixtureContext } from "../types.ts";
import { requireEqual, requireIncludesIds } from "./checks.ts";
import { timestamp } from "./dates.ts";

export type FixtureClient = ClientDocument & { id: string };

export async function applyClients(context: FixtureContext, clients: FixtureClient[]) {
  for (const { id, ...client } of clients) {
    await context.setDocument(`clients/${id}`, {
      ...client,
      createdAt: timestamp("2025-01-10"),
      updatedAt: timestamp("2025-01-10"),
    });
  }
}

export async function checkClients(
  context: FixtureContext,
  userId: string,
  clients: FixtureClient[],
) {
  const stored = await context.listUserDocuments<ClientDocument>("clients", userId);

  requireIncludesIds(
    stored.map((client) => client.id),
    clients.map((client) => client.id),
    `Clients listed for ${userId}`,
  );
  for (const client of clients) {
    const storedClient = stored.find((candidate) => candidate.id === client.id);
    requireEqual(storedClient?.taxId, client.taxId, `Tax id of ${client.id}`);
  }
}
