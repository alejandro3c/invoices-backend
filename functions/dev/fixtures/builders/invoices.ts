import { Timestamp } from "firebase-admin/firestore";
import {
  formatInvoiceNumber,
  getInvoiceCounterId,
  type InvoiceNumberingSettings,
} from "../../../src/invoices/numbering.ts";
import { calculateInvoiceTotals } from "../../../src/invoices/totals.ts";
import type {
  InvoiceDocument,
  InvoiceIncomeType,
  InvoiceLine,
  InvoiceStatus,
} from "../../../src/invoices/types.ts";
import { getInvoicePdfStoragePath, renderInvoicePdfBuffer } from "../../../src/pdf.ts";
import type { FixtureContext } from "../types.ts";
import { requireEqual, requireIncludesIds, requireValue } from "./checks.ts";
import type { FixtureClient } from "./clients.ts";
import { timestamp } from "./dates.ts";
import type { FixtureUser } from "./users.ts";

export type FixtureLine = {
  description: string;
  unitPrice: number;
  quantity?: number;
  discountRate?: number;
  taxRate?: number;
};

export type FixtureInvoiceSpec = {
  id: string;
  user: FixtureUser;
  client: FixtureClient;
  status: InvoiceStatus;
  /** Issued, paid and cancelled invoices; drafts have no number yet. */
  sequenceNumber?: number;
  issueDate: string;
  dueDate: string | null;
  incomeType?: InvoiceIncomeType;
  withholdingRate?: number;
  lines: FixtureLine[];
  paymentTerms?: string;
  publicNotes?: string;
};

export type FixtureInvoice = {
  id: string;
  document: InvoiceDocument;
};

export function buildInvoice(spec: FixtureInvoiceSpec): FixtureInvoice {
  const lines: InvoiceLine[] = spec.lines.map((line, index) => ({
    id: `${spec.id}-line-${index + 1}`,
    description: line.description,
    unitPrice: line.unitPrice,
    quantity: line.quantity ?? 1,
    discountRate: line.discountRate ?? 0,
    taxRate: line.taxRate ?? 21,
  }));
  const withholdingRate = spec.withholdingRate ?? 0;
  const issueDate = timestamp(spec.issueDate);
  const isDraft = spec.status === "draft";
  const year = isDraft ? null : issueDate.toDate().getFullYear();
  const sequenceNumber = isDraft
    ? null
    : requireValue(spec.sequenceNumber, `sequence number of ${spec.id}`);

  return {
    id: spec.id,
    document: {
      userId: spec.user.uid,
      status: spec.status,
      number:
        year === null || sequenceNumber === null
          ? null
          : formatInvoiceNumber({
              sequenceNumber,
              settings: spec.user.invoiceNumbering,
              year,
            }),
      sequenceNumber,
      year,
      clientId: spec.client.id,
      clientSnapshot: {
        taxId: spec.client.taxId,
        legalName: spec.client.legalName,
        billingAddress: spec.client.billingAddress,
      },
      issueDate,
      dueDate: spec.dueDate ? timestamp(spec.dueDate) : null,
      incomeType: spec.incomeType ?? "services",
      withholdingRate,
      lines,
      paymentTerms: spec.paymentTerms ?? "",
      publicNotes: spec.publicNotes ?? "",
      totals: calculateInvoiceTotals({ lines, withholdingRate }),
      issuedAt: isDraft ? null : issueDate,
      ...(isDraft
        ? {}
        : {
            pdf: {
              storagePath: getInvoicePdfStoragePath({
                invoiceId: spec.id,
                userId: spec.user.uid,
                version: 1,
              }),
              version: 1,
              generatedAt: issueDate,
            },
          }),
    },
  };
}

/** Next sequence number per year, as `issueInvoice` leaves the counters after issuing these invoices. */
function countersOf(invoices: FixtureInvoice[]) {
  const counters = new Map<string, { userId: string; year: number; nextSequenceNumber: number }>();

  for (const { document } of invoices) {
    if (document.year === null || document.sequenceNumber === null) continue;

    const id = getInvoiceCounterId(document.userId, document.year);
    const nextSequenceNumber = Math.max(
      counters.get(id)?.nextSequenceNumber ?? 1,
      document.sequenceNumber + 1,
    );

    counters.set(id, { userId: document.userId, year: document.year, nextSequenceNumber });
  }

  return counters;
}

export async function applyInvoices(context: FixtureContext, invoices: FixtureInvoice[]) {
  for (const { id, document } of invoices) {
    await context.setDocument(`invoices/${id}`, {
      ...document,
      createdAt: document.issueDate,
      updatedAt: document.issueDate,
    });

    if (document.pdf) {
      await context.saveFile(
        document.pdf.storagePath,
        await renderInvoicePdfBuffer({ invoice: document }),
        "application/pdf",
      );
      context.log(`PDF ${document.number}`);
    }
  }

  for (const [id, counter] of countersOf(invoices)) {
    await context.setDocument(`invoiceCounters/${id}`, {
      ...counter,
      updatedAt: Timestamp.now(),
    });
  }
}

export async function checkInvoices(
  context: FixtureContext,
  user: FixtureUser,
  invoices: FixtureInvoice[],
) {
  const stored = await context.listUserDocuments<InvoiceDocument>("invoices", user.uid);
  const settings = await context.getDocument<{
    invoiceNumbering?: Partial<InvoiceNumberingSettings>;
  }>(`userSettings/${user.uid}`);

  requireIncludesIds(
    stored.map((invoice) => invoice.id),
    invoices.map((invoice) => invoice.id),
    `Invoices listed for ${user.uid}`,
  );

  for (const { id } of invoices) {
    const invoice = requireValue(
      stored.find((candidate) => candidate.id === id),
      `invoice ${id}`,
    );

    requireEqual(
      invoice.totals,
      calculateInvoiceTotals({
        lines: invoice.lines,
        withholdingRate: invoice.withholdingRate,
      }),
      `Totals of ${id}`,
    );

    if (invoice.status === "draft") continue;

    requireEqual(
      invoice.number,
      formatInvoiceNumber({
        sequenceNumber: requireValue(invoice.sequenceNumber, `sequence number of ${id}`),
        settings: settings?.invoiceNumbering,
        year: requireValue(invoice.year, `year of ${id}`),
      }),
      `Number of ${id} with the user's numbering settings`,
    );

    const storagePath = requireValue(invoice.pdf?.storagePath, `PDF of ${id}`);
    if (!(await context.fileExists(storagePath))) {
      throw new Error(`PDF file of ${id} is missing: ${storagePath}`);
    }
  }

  // Issuing the next draft must not reuse a number already given in that year
  for (const year of new Set(stored.map((invoice) => invoice.year))) {
    if (year === null) continue;

    const highestSequence = Math.max(
      ...stored
        .filter((invoice) => invoice.year === year)
        .map((invoice) => invoice.sequenceNumber ?? 0),
    );
    const counter = await context.getDocument<{ nextSequenceNumber: number }>(
      `invoiceCounters/${getInvoiceCounterId(user.uid, year)}`,
    );

    if ((counter?.nextSequenceNumber ?? 1) <= highestSequence) {
      throw new Error(
        `Invoice counter ${user.uid} ${year} would reuse number ${counter?.nextSequenceNumber ?? 1}`,
      );
    }
  }
}
