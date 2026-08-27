import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  getInvoicePdfStoragePath,
  renderInvoiceHtml,
  renderInvoicePdfBuffer,
} from "./pdf.js";

// Set global options for all functions (default region)
setGlobalOptions({ region: "europe-west3" });

initializeApp();

const db = getFirestore();
const bucket = getStorage().bucket();

const pdfFunctionOptions = {
  concurrency: 2,
  memory: "1GiB",
  timeoutSeconds: 120,
};

const defaultInvoiceNumberingSettings = {
  prefix: "",
  includeYear: true,
  separator: "-",
  padding: 4,
  resetPeriod: "yearly",
};

function formatInvoiceNumber({ sequenceNumber, settings, year }) {
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

function getInvoiceCounterId(userId, year) {
  return `${userId}_${year}`;
}

function optionalText(value) {
  const trimmedValue = typeof value === "string" ? value.trim() : "";

  return trimmedValue === "" ? "" : trimmedValue;
}

function parseDate(value, fieldName) {
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

  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Timestamp(
      value.seconds,
      value.nanoseconds ?? 0,
    );
  }

  throw new HttpsError("invalid-argument", `${fieldName} no es una fecha válida.`);
}

function toClientSnapshot(client) {
  return {
    billingAddress: client.billingAddress,
    legalName: client.legalName,
    taxId: client.taxId,
  };
}

function toInvoiceLines(values) {
  if (!Array.isArray(values.lines) || values.lines.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "La factura debe tener al menos un concepto.",
    );
  }

  return values.lines.map((line) => ({
    description: optionalText(line.description),
    discountRate: Number(line.discountRate ?? 0),
    id: String(line.id ?? ""),
    quantity: Number(line.quantity ?? 0),
    taxRate: Number(line.taxRate ?? 0),
    unitPrice: Number(line.unitPrice ?? 0),
  }));
}

function calculateInvoiceTotals({ lines, withholdingRate }) {
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
    discountTotal,
    subtotal,
    taxTotal,
    total,
    withholdingTotal,
  };
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildInvoiceUpdatePayload({ client, values }) {
  const issueDate = parseDate(values.issueDate, "La fecha");

  if (!issueDate) {
    throw new HttpsError("invalid-argument", "La fecha es obligatoria.");
  }

  const lines = toInvoiceLines(values);
  const withholdingRate = Number(values.withholdingRate ?? 0);
  const totals = calculateInvoiceTotals({ lines, withholdingRate });

  return {
    clientId: client.id,
    clientSnapshot: toClientSnapshot(client),
    dueDate: parseDate(values.dueDate, "La fecha de vencimiento"),
    incomeType: values.incomeType,
    issueDate,
    lines,
    paymentTerms: optionalText(values.paymentTerms),
    publicNotes: optionalText(values.publicNotes),
    totals: {
      discountTotal: roundCurrency(totals.discountTotal),
      subtotal: roundCurrency(totals.subtotal),
      taxTotal: roundCurrency(totals.taxTotal),
      total: roundCurrency(totals.total),
      withholdingTotal: roundCurrency(totals.withholdingTotal),
    },
    updatedAt: FieldValue.serverTimestamp(),
    withholdingRate,
  };
}

async function generateAndStoreInvoicePdf({ invoiceId, userId }) {
  const invoiceRef = db.collection("invoices").doc(invoiceId);
  const invoiceSnapshot = await invoiceRef.get();

  if (!invoiceSnapshot.exists) {
    throw new HttpsError("not-found", "La factura no existe.");
  }

  const invoice = { id: invoiceSnapshot.id, ...invoiceSnapshot.data() };

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
export const helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", { structuredData: true });
  response.send("Hello from Firebase!");
});

export const issueInvoice = onCall(pdfFunctionOptions, async (request) => {
  const userId = request.auth?.uid;
  const invoiceId = request.data?.invoiceId;

  if (!userId) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para emitir una factura.",
    );
  }

  if (typeof invoiceId !== "string" || invoiceId.trim() === "") {
    throw new HttpsError(
      "invalid-argument",
      "El identificador de factura es obligatorio.",
    );
  }

  const issuedInvoice = await db.runTransaction(async (transaction) => {
    const invoiceRef = db.collection("invoices").doc(invoiceId);
    const invoiceSnapshot = await transaction.get(invoiceRef);

    if (!invoiceSnapshot.exists) {
      throw new HttpsError("not-found", "La factura no existe.");
    }

    const invoice = invoiceSnapshot.data();

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
    const settings = settingsSnapshot.data()?.invoiceNumbering;
    const counter = counterSnapshot.data();
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
});

export const generateInvoicePdf = onCall(pdfFunctionOptions, async (request) => {
  const userId = request.auth?.uid;
  const invoiceId = request.data?.invoiceId;

  if (!userId) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para generar el PDF.",
    );
  }

  if (typeof invoiceId !== "string" || invoiceId.trim() === "") {
    throw new HttpsError(
      "invalid-argument",
      "El identificador de factura es obligatorio.",
    );
  }

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
});

export const updateInvoice = onCall(pdfFunctionOptions, async (request) => {
  const userId = request.auth?.uid;
  const invoiceId = request.data?.invoiceId;
  const values = request.data?.values;

  if (!userId) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para editar una factura.",
    );
  }

  if (typeof invoiceId !== "string" || invoiceId.trim() === "") {
    throw new HttpsError(
      "invalid-argument",
      "El identificador de factura es obligatorio.",
    );
  }

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

    const invoice = invoiceSnapshot.data();

    if (invoice.userId !== userId) {
      throw new HttpsError(
        "permission-denied",
        "No puedes editar una factura de otro usuario.",
      );
    }

    const clientSnapshot = await transaction.get(
      db.collection("clients").doc(values.clientId),
    );

    if (!clientSnapshot.exists || clientSnapshot.data().userId !== userId) {
      throw new HttpsError("not-found", "El cliente no existe.");
    }

    const updatePayload = buildInvoiceUpdatePayload({
      client: { id: clientSnapshot.id, ...clientSnapshot.data() },
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
});

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
        invoice: { id: invoiceSnapshot.id, ...invoiceSnapshot.data() },
      }),
    );
});
