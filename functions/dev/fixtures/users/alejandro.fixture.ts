import { defaultInvoiceNumberingSettings } from "../../../src/invoices/numbering.ts";
import { applyUser, checkUser, FIXTURE_PASSWORD, type FixtureUser } from "../builders/users.ts";
import type { Fixture } from "../types.ts";

export const ALEJANDRO: FixtureUser = {
  uid: "alejandro",
  email: "alejandro@invoices.test",
  password: FIXTURE_PASSWORD,
  displayName: "Alejandro García",
  invoiceNumbering: defaultInvoiceNumberingSettings,
  invoicePreferences: {
    paymentTermsOptions: [
      "Transferencia bancaria a 30 días",
      "Transferencia bancaria al contado",
      "Domiciliación bancaria",
    ],
    defaultPaymentTerms: "Transferencia bancaria a 30 días",
    defaultTaxRate: 21,
    defaultWithholdingRate: 15,
  },
};

export const alejandroUserFixture: Fixture = {
  id: "users:alejandro",
  description:
    "Alejandro, a freelancer billing services: default numbering (2026-0001), 21% VAT, 15% IRPF and three payment terms",
  version: 1,

  async up(context) {
    await applyUser(context, ALEJANDRO);
  },

  async check(context) {
    await checkUser(context, ALEJANDRO);
  },
};
