export type FixtureAuthUser = {
  uid: string;
  email: string;
  password: string;
  displayName: string;
};

export type FixtureContext = {
  log(message: string): void;
  setDocument(path: string, data: Record<string, unknown>): Promise<void>;
  getDocument<T>(path: string): Promise<T | null>;
  /** The query the web app runs for every list: `where("userId", "==", userId)`. */
  listUserDocuments<T>(
    collection: string,
    userId: string,
  ): Promise<Array<T & { id: string }>>;
  createAuthUser(user: FixtureAuthUser): Promise<void>;
  getAuthUser(uid: string): Promise<{ uid: string; email?: string }>;
  saveFile(path: string, data: Uint8Array, contentType: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
};

export type Fixture = {
  id: string;
  description: string;
  /** Bump it when the fixture data changes, so `--list` flags loaded copies as outdated. */
  version: number;
  dependsOn?: string[];
  up(context: FixtureContext): Promise<void>;
  check(context: FixtureContext): Promise<void>;
};
