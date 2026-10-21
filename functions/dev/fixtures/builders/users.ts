import type { InvoiceNumberingSettings } from "../../../src/invoices/numbering.ts";
import type { FixtureAuthUser, FixtureContext } from "../types.ts";
import { requireEqual, requireValue } from "./checks.ts";
import { timestamp } from "./dates.ts";

export const FIXTURE_PASSWORD = "Fixture123!";

export type InvoicePreferences = {
  paymentTermsOptions: string[];
  defaultPaymentTerms: string;
  defaultTaxRate: number;
  defaultWithholdingRate: number;
};

export type FixtureUser = FixtureAuthUser & {
  invoiceNumbering: InvoiceNumberingSettings;
  invoicePreferences: InvoicePreferences;
};

type UserSettingsDocument = {
  userId: string;
  invoiceNumbering: InvoiceNumberingSettings;
  invoicePreferences: InvoicePreferences;
};

export async function applyUser(context: FixtureContext, user: FixtureUser) {
  await context.createAuthUser({
    uid: user.uid,
    email: user.email,
    password: user.password,
    displayName: user.displayName,
  });
  await context.setDocument(`userSettings/${user.uid}`, {
    userId: user.uid,
    invoiceNumbering: user.invoiceNumbering,
    invoicePreferences: user.invoicePreferences,
    createdAt: timestamp("2025-01-01"),
    updatedAt: timestamp("2025-01-01"),
  });
  context.log(`${user.email} / ${user.password}`);
}

export async function checkUser(context: FixtureContext, user: FixtureUser) {
  const authUser = await context.getAuthUser(user.uid);
  requireEqual(authUser.email, user.email, `Auth email of ${user.uid}`);

  const settings = requireValue(
    await context.getDocument<UserSettingsDocument>(`userSettings/${user.uid}`),
    `userSettings/${user.uid}`,
  );
  requireEqual(settings.userId, user.uid, `Settings owner of ${user.uid}`);
}
