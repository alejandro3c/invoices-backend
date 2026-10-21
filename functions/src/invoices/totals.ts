import type { InvoiceLine, InvoiceTotals } from "./types.ts";

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateInvoiceTotals({
  lines,
  withholdingRate,
}: {
  lines: InvoiceLine[];
  withholdingRate: number;
}): InvoiceTotals {
  const subtotal = lines.reduce(
    (currentSubtotal, line) => currentSubtotal + line.unitPrice * line.quantity,
    0,
  );
  const discountTotal = lines.reduce((currentDiscountTotal, line) => {
    const lineBase = line.unitPrice * line.quantity;

    return currentDiscountTotal + lineBase * (line.discountRate / 100);
  }, 0);
  const taxableBase = subtotal - discountTotal;
  const taxTotal = lines.reduce((currentTaxTotal, line) => {
    const lineBase = line.unitPrice * line.quantity;
    const lineDiscount = lineBase * (line.discountRate / 100);

    return currentTaxTotal + (lineBase - lineDiscount) * (line.taxRate / 100);
  }, 0);
  const withholdingTotal = taxableBase * (withholdingRate / 100);
  const total = taxableBase + taxTotal - withholdingTotal;

  return {
    discountTotal: roundCurrency(discountTotal),
    subtotal: roundCurrency(subtotal),
    taxTotal: roundCurrency(taxTotal),
    total: roundCurrency(total),
    withholdingTotal: roundCurrency(withholdingTotal),
  };
}
