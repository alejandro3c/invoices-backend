import {
  applyRecurringInvoices,
  checkRecurringInvoices,
  type FixtureRecurringSpec,
} from "../builders/recurring.ts";
import { CLIENTS } from "../clients/alejandro.fixture.ts";
import type { Fixture } from "../types.ts";
import { ALEJANDRO } from "../users/alejandro.fixture.ts";

const recurringInvoices: FixtureRecurringSpec[] = [
  {
    id: "acme-monthly",
    user: ALEJANDRO,
    client: CLIENTS.acme,
    enabled: true,
    frequency: "monthly",
    dayOfMonth: 1,
    dueDays: 30,
    withholdingRate: 15,
    lines: [{ description: "Mantenimiento web mensual", unitPrice: 150 }],
    paymentTerms: "Domiciliación bancaria",
  },
  {
    id: "globex-quarterly",
    user: ALEJANDRO,
    client: CLIENTS.globex,
    enabled: true,
    frequency: "quarterly",
    dayOfMonth: 15,
    dueDays: 15,
    withholdingRate: 15,
    lines: [
      { description: "Soporte técnico trimestral", unitPrice: 600 },
      { description: "Bolsa de horas de evolutivo", unitPrice: 45, quantity: 10 },
    ],
    paymentTerms: "Transferencia bancaria a 30 días",
  },
  {
    // Day 31 is clamped to the last day of shorter months
    id: "lucia-yearly",
    user: ALEJANDRO,
    client: CLIENTS.lucia,
    enabled: false,
    frequency: "yearly",
    dayOfMonth: 31,
    dueDays: 0,
    lines: [{ description: "Renovación de dominio y hosting", unitPrice: 120 }],
    publicNotes: "Pausada hasta que la clienta confirme la renovación.",
  },
];

export const recurringFixture: Fixture = {
  id: "recurring:alejandro",
  description:
    "Alejandro's recurring invoices: monthly and quarterly enabled, and a paused yearly one on day 31",
  version: 1,
  dependsOn: ["clients:alejandro"],

  async up(context) {
    await applyRecurringInvoices(context, recurringInvoices);
  },

  async check(context) {
    await checkRecurringInvoices(context, ALEJANDRO.uid, recurringInvoices);
  },
};
