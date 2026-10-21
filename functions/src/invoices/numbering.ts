export type InvoiceNumberingSettings = {
  prefix: string;
  includeYear: boolean;
  separator: string;
  padding: number;
  resetPeriod: "yearly";
};

export const defaultInvoiceNumberingSettings: InvoiceNumberingSettings = {
  prefix: "",
  includeYear: true,
  separator: "-",
  padding: 4,
  resetPeriod: "yearly",
};

export function formatInvoiceNumber({
  sequenceNumber,
  settings,
  year,
}: {
  sequenceNumber: number;
  settings?: Partial<InvoiceNumberingSettings>;
  year: number;
}) {
  const resolvedSettings = {
    ...defaultInvoiceNumberingSettings,
    ...settings,
  };
  const paddedSequence = String(sequenceNumber).padStart(
    resolvedSettings.padding,
    "0",
  );

  return [
    resolvedSettings.prefix || null,
    resolvedSettings.includeYear ? String(year) : null,
    paddedSequence,
  ]
    .filter(Boolean)
    .join(resolvedSettings.separator);
}

export function getInvoiceCounterId(userId: string, year: number) {
  return `${userId}_${year}`;
}
