import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const PROJECT_ID = "icy-invoices";
const STORAGE_BUCKET = "icy-invoices.firebasestorage.app";
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];

type FirebaseConfig = {
  emulators: Record<string, { host?: string; port?: number }>;
};

const firebaseConfig = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../firebase.json"), "utf8"),
) as FirebaseConfig;

const EMULATOR_VARIABLES = {
  firestore: "FIRESTORE_EMULATOR_HOST",
  auth: "FIREBASE_AUTH_EMULATOR_HOST",
  storage: "FIREBASE_STORAGE_EMULATOR_HOST",
} as const;

function assertLocalHost(variableName: string, value: string) {
  const url = new URL(value.includes("://") ? value : `http://${value}`);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (!LOCAL_HOSTS.includes(hostname)) {
    throw new Error(`${variableName} must point to localhost, received ${value}`);
  }
}

/**
 * Points the Admin SDK at the emulators from firebase.json, unless the variables are
 * already set, and refuses anything that is not localhost or not this project.
 */
export function useLocalEmulators() {
  for (const [emulator, variableName] of Object.entries(EMULATOR_VARIABLES)) {
    const port = firebaseConfig.emulators[emulator]?.port;

    process.env[variableName] ??= `127.0.0.1:${port}`;
    assertLocalHost(variableName, process.env[variableName]);
  }

  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;

  if (projectId && projectId !== PROJECT_ID) {
    throw new Error(`Unexpected Firebase project: ${projectId}`);
  }

  return Object.fromEntries(
    Object.entries(EMULATOR_VARIABLES).map(([emulator, variableName]) => [
      emulator,
      process.env[variableName],
    ]),
  ) as Record<keyof typeof EMULATOR_VARIABLES, string>;
}

async function emulatorDelete(variableName: string, path: string) {
  const response = await fetch(`http://${process.env[variableName]}${path}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(
      `Could not clear ${path}: ${response.status} ${await response.text()}`,
    );
  }
}

/**
 * Empties Firestore, Auth and Storage. Firestore and Auth use endpoints that only the
 * emulators have, so this can never reach a real project.
 */
export async function clearEmulators() {
  await emulatorDelete(
    EMULATOR_VARIABLES.firestore,
    `/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
  );
  await emulatorDelete(
    EMULATOR_VARIABLES.auth,
    `/emulator/v1/projects/${PROJECT_ID}/accounts`,
  );
  await getEmulatorServices().bucket.deleteFiles();
}

let services:
  | {
      auth: ReturnType<typeof getAuth>;
      bucket: ReturnType<ReturnType<typeof getStorage>["bucket"]>;
      db: ReturnType<typeof getFirestore>;
    }
  | undefined;

export function getEmulatorServices() {
  if (!services) {
    const app =
      getApps()[0] ??
      initializeApp({ projectId: PROJECT_ID, storageBucket: STORAGE_BUCKET });

    services = {
      auth: getAuth(app),
      bucket: getStorage(app).bucket(),
      db: getFirestore(app),
    };
  }

  return services;
}
