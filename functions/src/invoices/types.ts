import type { FieldValue, Timestamp } from "firebase-admin/firestore";

export type InvoiceStatus = "draft" | "issued" | "paid" | "cancelled";

export type InvoiceIncomeType = "services" | "goods_sale";

export type BillingAddress = {
  addressLine: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
};

export type ClientDocument = {
  userId: string;
  taxId: string;
  legalName: string;
  billingAddress: BillingAddress;
  email?: string;
  phone?: string;
  notes?: string;
};

export type InvoiceClientSnapshot = Pick<
  ClientDocument,
  "billingAddress" | "legalName" | "taxId"
>;

export type InvoiceLine = {
  id: string;
  description: string;
  unitPrice: number;
  quantity: number;
  discountRate: number;
  taxRate: number;
};

export type InvoiceTotals = {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  withholdingTotal: number;
  total: number;
};

export type InvoicePdf = {
  storagePath: string;
  version: number;
  generatedAt: Timestamp | FieldValue | null;
};

export type InvoiceDocument = {
  userId: string;
  status: InvoiceStatus;
  number: string | null;
  sequenceNumber: number | null;
  year: number | null;
  clientId: string;
  clientSnapshot: InvoiceClientSnapshot;
  issueDate: Timestamp | null;
  dueDate: Timestamp | null;
  incomeType: InvoiceIncomeType;
  withholdingRate: number;
  lines: InvoiceLine[];
  paymentTerms?: string;
  publicNotes?: string;
  totals: InvoiceTotals;
  pdf?: InvoicePdf | null;
  issuedAt: Timestamp | null;
};
