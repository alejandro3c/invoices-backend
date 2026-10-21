import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  formatInvoiceNumber,
  getInvoiceCounterId,
  type InvoiceNumberingSettings,
} from "./invoices/numbering.ts";
import { calculateInvoiceTotals } from "./invoices/totals.ts";
import type {
  ClientDocument,
  InvoiceDocument,
  InvoiceIncomeType,
  InvoiceLine,
} from "./invoices/types.ts";
import {
  getInvoicePdfStoragePath,
  renderInvoiceHtml,
  renderInvoicePdfBuffer,
} from "./pdf.ts";

// Set global options for all functions (default region)
setGlobalOptions({ region: "europe-west3" });

initializeApp();

const db = getFirestore();
const bucket = getStorage().bucket();

const pdfFunctionOptions = {
  concurrency: 2,
  memory: "1GiB" as const,
  timeoutSeconds: 120,
};

type InvoiceRequest = {
  invoiceId?: unknown;
};

// Form values sent by the web; every field is checked or coerced before it is stored
type InvoiceValuesInput = {
  clientId?: unknown;
  dueDate?: unknown;
  incomeType?: unknown;
  issueDate?: unknown;
  lines?: unknown;
  paymentTerms?: unknown;
  publicNotes?: unknown;
  withholdingRate?: unknown;
};

type UpdateInvoiceRequest = InvoiceRequest & {
  values?: InvoiceValuesInput;
};

type UserSettingsDocument = {
  invoiceNumbering?: Partial<InvoiceNumberingSettings>;
};

type InvoiceCounterDocument = {
  nextSequenceNumber?: number;
};

function optionalText(value: unknown) {
  const trimmedValue = typeof value === "string" ? value.trim() : "";

  return trimmedValue === "" ? "" : trimmedValue;
}

function parseDate(value: unknown, fieldName: string) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return Timestamp.fromDate(date);
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Timestamp.fromDate(value);
  }

  if (
    typeof value === "object" &&
    "seconds" in value &&
    typeof value.seconds === "number"
  ) {
    const nanoseconds =
      "nanoseconds" in value && typeof value.nanoseconds === "number"
        ? value.nanoseconds
        : 0;

    return new Timestamp(value.seconds, nanoseconds);
  }

  throw new HttpsError("invalid-argument", `${fieldName} no es una fecha válida.`);
}

function toClientSnapshot(client: ClientDocument) {
  return {
    billingAddress: client.billingAddress,
    legalName: client.legalName,
    taxId: client.taxId,
  };
}

function toInvoiceLines(values: InvoiceValuesInput): InvoiceLine[] {
  if (!Array.isArray(values.lines) || values.lines.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "La factura debe tener al menos un concepto.",
    );
  }

  return values.lines.map(
    (line: Partial<Record<keyof InvoiceLine, unknown>>) => ({
      description: optionalText(line.description),
      discountRate: Number(line.discountRate ?? 0),
      id: String(line.id ?? ""),
      quantity: Number(line.quantity ?? 0),
      taxRate: Number(line.taxRate ?? 0),
      unitPrice: Number(line.unitPrice ?? 0),
    }),
  );
}

function buildInvoiceUpdatePayload({
  client,
  values,
}: {
  client: ClientDocument & { id: string };
  values: InvoiceValuesInput;
}) {
  const issueDate = parseDate(values.issueDate, "La fecha");

  if (!issueDate) {
    throw new HttpsError("invalid-argument", "La fecha es obligatoria.");
  }

  const lines = toInvoiceLines(values);
  const withholdingRate = Number(values.withholdingRate ?? 0);

  return {
    clientId: client.id,
    clientSnapshot: toClientSnapshot(client),
    dueDate: parseDate(values.dueDate, "La fecha de vencimiento"),
    incomeType: values.incomeType as InvoiceIncomeType,
    issueDate,
    lines,
    paymentTerms: optionalText(values.paymentTerms),
    publicNotes: optionalText(values.publicNotes),
    totals: calculateInvoiceTotals({ lines, withholdingRate }),
    updatedAt: FieldValue.serverTimestamp(),
    withholdingRate,
  };
}

function requireInvoiceId(invoiceId: unknown): string {
  if (typeof invoiceId !== "string" || invoiceId.trim() === "") {
    throw new HttpsError(
      "invalid-argument",
      "El identificador de factura es obligatorio.",
    );
  }

  return invoiceId;
}

async function generateAndStoreInvoicePdf({
  invoiceId,
  userId,
}: {
  invoiceId: string;
  userId: string;
}) {
  const invoiceRef = db.collection("invoices").doc(invoiceId);
  const invoiceSnapshot = await invoiceRef.get();

  if (!invoiceSnapshot.exists) {
    throw new HttpsError("not-found", "La factura no existe.");
  }

  const invoice = invoiceSnapshot.data() as InvoiceDocument;

  if (invoice.userId !== userId) {
    throw new HttpsError(
      "permission-denied",
      "No puedes generar el PDF de una factura de otro usuario.",
    );
  }

  if (invoice.status === "draft") {
    return null;
  }

  const version = (invoice.pdf?.version ?? 0) + 1;
  const storagePath = getInvoicePdfStoragePath({
    invoiceId,
    userId,
    version,
  });
  const pdfBuffer = await renderInvoicePdfBuffer({ invoice });

  await bucket.file(storagePath).save(pdfBuffer, {
    contentType: "application/pdf",
    metadata: {
      cacheControl: "private, max-age=0, no-cache",
    },
  });

  const pdf = {
    generatedAt: FieldValue.serverTimestamp(),
    storagePath,
    version,
  };

  await invoiceRef.update({
    pdf,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    storagePath,
    version,
  };
}

// Export your cloud functions here:
export const helloWorld = onRequest((_request, response) => {
  logger.info("Hello logs!", { structuredData: true });
  response.send("Hello from Firebase!");
});

export const issueInvoice = onCall<InvoiceRequest>(
  pdfFunctionOptions,
  async (request) => {
    const userId = request.auth?.uid;

    if (!userId) {
      throw new HttpsError(
        "unauthenticated",
        "Debes iniciar sesión para emitir una factura.",
      );
    }

    const invoiceId = requireInvoiceId(request.data?.invoiceId);

    const issuedInvoice = await db.runTransaction(async (transaction) => {
      const invoiceRef = db.collection("invoices").doc(invoiceId);
      const invoiceSnapshot = await transaction.get(invoiceRef);

      if (!invoiceSnapshot.exists) {
        throw new HttpsError("not-found", "La factura no existe.");
      }

      const invoice = invoiceSnapshot.data() as InvoiceDocument;

      if (invoice.userId !== userId) {
        throw new HttpsError(
          "permission-denied",
          "No puedes emitir una factura de otro usuario.",
        );
      }

      if (invoice.status !== "draft") {
        throw new HttpsError(
          "failed-precondition",
          "Solo se pueden emitir facturas en borrador.",
        );
      }

      if (invoice.number !== null || invoice.sequenceNumber !== null) {
        throw new HttpsError(
          "failed-precondition",
          "La factura ya tiene numeración asignada.",
        );
      }

      if (!invoice.issueDate?.toDate) {
        throw new HttpsError(
          "failed-precondition",
          "La factura no tiene una fecha válida.",
        );
      }

      const year = invoice.issueDate.toDate().getFullYear();
      const settingsRef = db.collection("userSettings").doc(userId);
      const counterRef = db
        .collection("invoiceCounters")
        .doc(getInvoiceCounterId(userId, year));
      const settingsSnapshot = await transaction.get(settingsRef);
      const counterSnapshot = await transaction.get(counterRef);
      const settings = (settingsSnapshot.data() as UserSettingsDocument | undefined)
        ?.invoiceNumbering;
      const counter = counterSnapshot.data() as InvoiceCounterDocument | undefined;
      const sequenceNumber = counter?.nextSequenceNumber ?? 1;
      const number = formatInvoiceNumber({
        sequenceNumber,
        settings,
        year,
      });

      transaction.set(
        counterRef,
        {
          userId,
          year,
          nextSequenceNumber: sequenceNumber + 1,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      transaction.update(invoiceRef, {
        status: "issued",
        number,
        sequenceNumber,
        year,
        issuedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        invoiceId,
        number,
        sequenceNumber,
        year,
      };
    });

    const pdf = await generateAndStoreInvoicePdf({ invoiceId, userId });

    return {
      ...issuedInvoice,
      pdf,
    };
  },
);

export const generateInvoicePdf = onCall<InvoiceRequest>(
  pdfFunctionOptions,
  async (request) => {
    const userId = request.auth?.uid;

    if (!userId) {
      throw new HttpsError(
        "unauthenticated",
        "Debes iniciar sesión para generar el PDF.",
      );
    }

    const invoiceId = requireInvoiceId(request.data?.invoiceId);
    const pdf = await generateAndStoreInvoicePdf({ invoiceId, userId });

    if (!pdf) {
      throw new HttpsError(
        "failed-precondition",
        "No se puede generar el PDF de una factura en borrador.",
      );
    }

    return {
      invoiceId,
      pdf,
    };
  },
);

export const updateInvoice = onCall<UpdateInvoiceRequest>(
  pdfFunctionOptions,
  async (request) => {
    const userId = request.auth?.uid;
    const values = request.data?.values;

    if (!userId) {
      throw new HttpsError(
        "unauthenticated",
        "Debes iniciar sesión para editar una factura.",
      );
    }

    const invoiceId = requireInvoiceId(request.data?.invoiceId);

    if (!values || typeof values !== "object") {
      throw new HttpsError(
        "invalid-argument",
        "Los datos de factura son obligatorios.",
      );
    }

    const result = await db.runTransaction(async (transaction) => {
      const invoiceRef = db.collection("invoices").doc(invoiceId);
      const invoiceSnapshot = await transaction.get(invoiceRef);

      if (!invoiceSnapshot.exists) {
        throw new HttpsError("not-found", "La factura no existe.");
      }

      const invoice = invoiceSnapshot.data() as InvoiceDocument;

      if (invoice.userId !== userId) {
        throw new HttpsError(
          "permission-denied",
          "No puedes editar una factura de otro usuario.",
        );
      }

      const clientSnapshot = await transaction.get(
        db.collection("clients").doc(values.clientId as string),
      );
      const client = clientSnapshot.data() as ClientDocument | undefined;

      if (!client || client.userId !== userId) {
        throw new HttpsError("not-found", "El cliente no existe.");
      }

      const updatePayload = buildInvoiceUpdatePayload({
        client: { id: clientSnapshot.id, ...client },
        values,
      });

      transaction.update(invoiceRef, updatePayload);

      return {
        shouldGeneratePdf: invoice.status !== "draft",
      };
    });

    const pdf = result.shouldGeneratePdf
      ? await generateAndStoreInvoicePdf({ invoiceId, userId })
      : null;

    return {
      invoiceId,
      pdf,
    };
  },
);

export const previewInvoiceHtml = onRequest(async (request, response) => {
  if (process.env.FUNCTIONS_EMULATOR !== "true") {
    response.status(404).send("Not found");
    return;
  }

  const invoiceId = request.query.invoiceId;

  if (typeof invoiceId !== "string") {
    response.status(400).send("invoiceId is required");
    return;
  }

  const invoiceSnapshot = await db.collection("invoices").doc(invoiceId).get();

  if (!invoiceSnapshot.exists) {
    response.status(404).send("Invoice not found");
    return;
  }

  response
    .status(200)
    .type("html")
    .send(
      renderInvoiceHtml({
        invoice: invoiceSnapshot.data() as InvoiceDocument,
      }),
    );
});
