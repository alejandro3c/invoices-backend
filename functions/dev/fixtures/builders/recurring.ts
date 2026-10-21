import { Timestamp } from "firebase-admin/firestore";
import type { InvoiceIncomeType } from "../../../src/invoices/types.ts";
import type { FixtureContext } from "../types.ts";
import { requireEqual, requireIncludesIds, requireValue } from "./checks.ts";
import type { FixtureClient } from "./clients.ts";
import { timestamp, todayDate } from "./dates.ts";
import type { FixtureLine } from "./invoices.ts";
import type { FixtureUser } from "./users.ts";

type RecurringFrequency = "monthly" | "quarterly" | "yearly";

export type FixtureRecurringSpec = {
  id: string;
  user: FixtureUser;
  client: FixtureClient;
  enabled: boolean;
  frequency: RecurringFrequency;
  dayOfMonth: number;
  dueDays: number;
  incomeType?: InvoiceIncomeType;
  withholdingRate?: number;
  lines: FixtureLine[];
  paymentTerms?: string;
  publicNotes?: string;
};

const MONTHS_BY_FREQUENCY: Record<RecurringFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

function dateAtDay(year: number, month: number, dayOfMonth: number) {
  const lastDay = new Date(year, month + 1, 0).getDate();

  return new Date(year, month, Math.min(dayOfMonth, lastDay));
}

// Same rule as the web's recurringInvoiceService: this month's run, or the next one if it has passed
function nextRunAt(dayOfMonth: number, frequency: RecurringFrequency) {
  const today = todayDate();
  const thisMonth = dateAtDay(today.getFullYear(), today.getMonth(), dayOfMonth);

  return thisMonth < today
    ? dateAtDay(
        thisMonth.getFullYear(),
        thisMonth.getMonth() + MONTHS_BY_FREQUENCY[frequency],
        thisMonth.getDate(),
      )
    : thisMonth;
}

export async function applyRecurringInvoices(
  context: FixtureContext,
  recurringInvoices: FixtureRecurringSpec[],
) {
  for (const spec of recurringInvoices) {
    await context.setDocument(`recurringInvoices/${spec.id}`, {
      userId: spec.user.uid,
      clientId: spec.client.id,
      name: `Facturación recurrente - ${spec.client.legalName}`,
      enabled: spec.enabled,
      schedule: {
        dayOfMonth: spec.dayOfMonth,
        frequency: spec.frequency,
        interval: 1,
        nextRunAt: spec.enabled
          ? Timestamp.fromDate(nextRunAt(spec.dayOfMonth, spec.frequency))
          : null,
      },
      draft: {
        dueDays: spec.dueDays,
        incomeType: spec.incomeType ?? "services",
        lines: spec.lines.map((line, index) => ({
          id: `${spec.id}-line-${index + 1}`,
          description: line.description,
          unitPrice: line.unitPrice,
          quantity: line.quantity ?? 1,
          discountRate: line.discountRate ?? 0,
          taxRate: line.taxRate ?? 21,
        })),
        paymentTerms: spec.paymentTerms ?? "",
        publicNotes: spec.publicNotes ?? "",
        withholdingRate: spec.withholdingRate ?? 0,
      },
      behavior: { autoIssue: false, createAs: "draft" },
      lastRunAt: null,
      createdAt: timestamp("2025-06-01"),
      updatedAt: timestamp("2025-06-01"),
    });
  }
}

export async function checkRecurringInvoices(
  context: FixtureContext,
  userId: string,
  recurringInvoices: FixtureRecurringSpec[],
) {
  const stored = await context.listUserDocuments<{
    clientId: string;
    enabled: boolean;
    schedule: { nextRunAt: Timestamp | null };
  }>("recurringInvoices", userId);

  requireIncludesIds(
    stored.map((recurringInvoice) => recurringInvoice.id),
    recurringInvoices.map((recurringInvoice) => recurringInvoice.id),
    `Recurring invoices listed for ${userId}`,
  );

  for (const spec of recurringInvoices) {
    const recurringInvoice = requireValue(
      stored.find((candidate) => candidate.id === spec.id),
      `recurring invoice ${spec.id}`,
    );
    const client = await context.getDocument<{ userId: string }>(
      `clients/${recurringInvoice.clientId}`,
    );

    requireEqual(client?.userId, userId, `Client owner of ${spec.id}`);
    requireEqual(
      recurringInvoice.schedule.nextRunAt !== null,
      recurringInvoice.enabled,
      `Only enabled recurring invoices have a next run (${spec.id})`,
    );
  }
}
