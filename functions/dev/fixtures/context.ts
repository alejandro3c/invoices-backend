import { getEmulatorServices } from "./emulators.ts";
import type { Fixture, FixtureContext } from "./types.ts";

// Which fixtures are loaded; the app never reads it
const STATE_COLLECTION = "__fixtures";

export type LoadedFixture = {
  fixtureId: string;
  version: number;
};

export async function getLoadedFixtures(): Promise<LoadedFixture[]> {
  const snapshot = await getEmulatorServices()
    .db.collection(STATE_COLLECTION)
    .get();

  return snapshot.docs.map((document) => ({
    fixtureId: document.id,
    version: document.data().version,
  }));
}

export async function markFixtureLoaded(fixture: Fixture) {
  await getEmulatorServices()
    .db.collection(STATE_COLLECTION)
    .doc(fixture.id)
    .set({ version: fixture.version, loadedAt: new Date() });
}

export function createFixtureContext(): FixtureContext {
  const { auth, bucket, db } = getEmulatorServices();

  return {
    log(message) {
      process.stdout.write(`    ${message}\n`);
    },

    async setDocument(documentPath, data) {
      await db.doc(documentPath).set(data);
    },

    async getDocument<T>(documentPath: string) {
      const snapshot = await db.doc(documentPath).get();

      return snapshot.exists ? (snapshot.data() as T) : null;
    },

    async listUserDocuments<T>(collection: string, userId: string) {
      const snapshot = await db
        .collection(collection)
        .where("userId", "==", userId)
        .get();

      return snapshot.docs.map((document) => ({
        id: document.id,
        ...(document.data() as T),
      }));
    },

    async createAuthUser(user) {
      await auth.createUser({ ...user, emailVerified: true });
    },

    async getAuthUser(uid) {
      const user = await auth.getUser(uid);

      return { uid: user.uid, email: user.email };
    },

    async saveFile(path, data, contentType) {
      await bucket.file(path).save(data, { contentType });
    },

    async fileExists(path) {
      const [exists] = await bucket.file(path).exists();

      return exists;
    },
  };
}
