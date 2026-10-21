import type { Timestamp } from "firebase-admin/firestore";
import puppeteer from "puppeteer";
import type {
  BillingAddress,
  InvoiceDocument,
  InvoiceLine,
} from "./invoices/types.ts";

export type InvoicePdfInput = Pick<
  InvoiceDocument,
  | "clientSnapshot"
  | "dueDate"
  | "issueDate"
  | "lines"
  | "number"
  | "paymentTerms"
  | "publicNotes"
  | "totals"
>;

const currencyFormatter = new Intl.NumberFormat("es-ES", {
  currency: "EUR",
  style: "currency",
});

const dateFormatter = new Intl.DateTimeFormat("es-ES");

function formatCurrency(value: number | undefined) {
  return currencyFormatter.format(value ?? 0);
}

function formatDate(value: Timestamp | null | undefined) {
  if (!value?.toDate) {
    return "—";
  }

  return dateFormatter.format(value.toDate());
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getLineTotal(line: InvoiceLine) {
  const base = line.unitPrice * line.quantity;
  const discount = base * (line.discountRate / 100);
  const taxableBase = base - discount;
  const tax = taxableBase * (line.taxRate / 100);

  return taxableBase + tax;
}

function formatSignedWithholding(value: number) {
  return value > 0 ? `-${formatCurrency(value)}` : formatCurrency(0);
}

function renderAddress(address: BillingAddress | undefined) {
  return [
    address?.addressLine,
    [address?.postalCode, address?.city].filter(Boolean).join(" "),
    address?.province,
    address?.country,
  ]
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");
}

export function getInvoicePdfStoragePath({
  invoiceId,
  userId,
  version,
}: {
  invoiceId: string;
  userId: string;
  version: number;
}) {
  return `users/${userId}/invoices/${invoiceId}/invoice-v${version}.pdf`;
}

export function renderInvoiceHtml({ invoice }: { invoice: InvoicePdfInput }) {
  const client = invoice.clientSnapshot;
  const lines = invoice.lines ?? [];
  const totals: Partial<InvoiceDocument["totals"]> = invoice.totals ?? {};

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Factura ${escapeHtml(invoice.number)}</title>
    <style>
      @page {
        margin: 18mm;
        size: A4;
      }

      * {
        box-sizing: border-box;
      }

      body {
        color: #111827;
        font-family: Inter, Arial, sans-serif;
        font-size: 12px;
        line-height: 1.45;
        margin: 0;
      }

      .header {
        align-items: flex-start;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        padding-bottom: 28px;
      }

      .title {
        font-size: 28px;
        font-weight: 750;
        letter-spacing: 0;
        margin: 0 0 8px;
      }

      .muted {
        color: #6b7280;
      }

      .meta {
        min-width: 210px;
      }

      .meta-row,
      .total-row {
        display: flex;
        justify-content: space-between;
        gap: 24px;
      }

      .meta-row + .meta-row {
        margin-top: 6px;
      }

      .section-grid {
        display: grid;
        gap: 36px;
        grid-template-columns: 1fr 1fr;
        margin-top: 28px;
      }

      h2 {
        font-size: 13px;
        margin: 0 0 10px;
      }

      .box {
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 14px;
      }

      table {
        border-collapse: collapse;
        margin-top: 34px;
        width: 100%;
      }

      th {
        border-bottom: 1px solid #d1d5db;
        color: #374151;
        font-size: 11px;
        padding: 0 0 8px;
        text-align: left;
      }

      td {
        border-bottom: 1px solid #f3f4f6;
        padding: 10px 0;
        vertical-align: top;
      }

      .number {
        text-align: right;
        white-space: nowrap;
      }

      .totals {
        margin-left: auto;
        margin-top: 24px;
        width: 260px;
      }

      .total-row {
        padding: 5px 0;
      }

      .total-row.final {
        border-top: 1px solid #d1d5db;
        font-size: 15px;
        font-weight: 750;
        margin-top: 7px;
        padding-top: 11px;
      }

      .notes {
        margin-top: 32px;
      }

      .notes .box + .box {
        margin-top: 12px;
      }
    </style>
  </head>
  <body>
    <header class="header">
      <div>
        <h1 class="title">Factura</h1>
        <div class="muted">Datos del emisor pendientes de configurar.</div>
      </div>
      <div class="meta">
        <div class="meta-row"><strong>Número</strong><span>${escapeHtml(invoice.number)}</span></div>
        <div class="meta-row"><strong>Fecha</strong><span>${formatDate(invoice.issueDate)}</span></div>
        <div class="meta-row"><strong>Vencimiento</strong><span>${formatDate(invoice.dueDate)}</span></div>
      </div>
    </header>

    <section class="section-grid">
      <div class="box">
        <h2>Cliente</h2>
        <strong>${escapeHtml(client?.legalName)}</strong>
        <div>NIF: ${escapeHtml(client?.taxId)}</div>
        <div class="muted" style="margin-top: 8px;">${renderAddress(client?.billingAddress)}</div>
      </div>
      <div class="box">
        <h2>Resumen</h2>
        <div class="meta-row"><span>Base</span><strong>${formatCurrency(totals.subtotal)}</strong></div>
        <div class="meta-row"><span>IVA</span><strong>${formatCurrency(totals.taxTotal)}</strong></div>
        <div class="meta-row"><span>Retención</span><strong>${formatCurrency(totals.withholdingTotal)}</strong></div>
      </div>
    </section>

    <table>
      <thead>
        <tr>
          <th>Concepto</th>
          <th class="number">Base</th>
          <th class="number">Cant.</th>
          <th class="number">Dto.</th>
          <th class="number">IVA</th>
          <th class="number">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lines
          .map(
            (line) => `
          <tr>
            <td>${escapeHtml(line.description)}</td>
            <td class="number">${formatCurrency(line.unitPrice)}</td>
            <td class="number">${escapeHtml(line.quantity)}</td>
            <td class="number">${escapeHtml(line.discountRate)}%</td>
            <td class="number">${escapeHtml(line.taxRate)}%</td>
            <td class="number">${formatCurrency(getLineTotal(line))}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>

    <section class="totals">
      <div class="total-row"><span>Base</span><strong>${formatCurrency(totals.subtotal)}</strong></div>
      <div class="total-row"><span>Descuento</span><strong>${formatCurrency(totals.discountTotal)}</strong></div>
      <div class="total-row"><span>IVA</span><strong>${formatCurrency(totals.taxTotal)}</strong></div>
      <div class="total-row"><span>Retención</span><strong>${formatSignedWithholding(totals.withholdingTotal ?? 0)}</strong></div>
      <div class="total-row final"><span>Total</span><span>${formatCurrency(totals.total)}</span></div>
    </section>

    <section class="notes">
      ${
        invoice.paymentTerms
          ? `<div class="box"><h2>Forma de pago</h2>${escapeHtml(invoice.paymentTerms)}</div>`
          : ""
      }
      ${
        invoice.publicNotes
          ? `<div class="box"><h2>Notas</h2>${escapeHtml(invoice.publicNotes)}</div>`
          : ""
      }
    </section>
  </body>
</html>`;
}

export async function renderInvoicePdfBuffer({
  invoice,
}: {
  invoice: InvoicePdfInput;
}) {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(renderInvoiceHtml({ invoice }), {
      waitUntil: "load",
    });

    return await page.pdf({
      format: "A4",
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
}
