import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as logger from "firebase-functions/logger";
import admin from "firebase-admin";

// Set global options for all functions (default region)
setGlobalOptions({ region: "europe-west3" });

admin.initializeApp();

const db = admin.firestore();

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

// Export your cloud functions here:
export const helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", { structuredData: true });
  response.send("Hello from Firebase!");
});

export const issueInvoice = onCall(async (request) => {
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

  return db.runTransaction(async (transaction) => {
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    transaction.update(invoiceRef, {
      status: "issued",
      number,
      sequenceNumber,
      year,
      issuedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      number,
      sequenceNumber,
      year,
    };
  });
});
