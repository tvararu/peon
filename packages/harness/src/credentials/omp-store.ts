import { Database } from "bun:sqlite";
import { existsSync, statSync } from "node:fs";
import type {
  AuthOperationOptions,
  Credential,
  CredentialInfo,
  CredentialStore,
} from "@earendil-works/pi-ai";
import { messageOf } from "@peon/core/lib/errors";

export type OmpRow = {
  access: string;
  expires: number;
  accountId: string | undefined;
};
export type OmpStoreInit = { dbPath: string; now: () => number };

type Modify = (
  current: Credential | undefined,
) => Promise<Credential | undefined>;

const PROVIDER = "openai-codex";
const REFRESH_WINDOW_MS = 300_000;
const BUSY_RETRIES = 3;
const BUSY_WAIT_MS = 50;
const ROW_SQL =
  "select data from auth_credentials where provider = 'openai-codex' and credential_type = 'oauth' and disabled_cause is null order by updated_at desc limit 1";
const MISSING =
  "No Codex login found in omp. Run omp and log in to openai-codex. Then send your message again.";

export class CredentialExpiredError extends Error {
  readonly provider: string;
  readonly expires: number;

  constructor(provider: string, expires: number) {
    super(
      `The Codex login expired at ${new Date(expires).toISOString()}. Run omp once so that it refreshes the login. Then send your message again.`,
    );
    this.name = "CredentialExpiredError";
    this.provider = provider;
    this.expires = expires;
  }
}

export function ompDbPath(home: string): string {
  return `${home}/.omp/agent/agent.db`;
}

export function readOmpRow(dbPath: string): OmpRow | undefined {
  if (!existsSync(dbPath)) return undefined;
  const data = queryWithRetry(dbPath);
  return data === undefined ? undefined : parseRow(data);
}

function queryWithRetry(dbPath: string): string | undefined {
  let attempt = 0;
  while (true) {
    try {
      return queryOnce(dbPath);
    } catch (error) {
      if (!isBusy(error) || attempt >= BUSY_RETRIES) throw error;
      attempt += 1;
      Bun.sleepSync(BUSY_WAIT_MS);
    }
  }
}

function queryOnce(dbPath: string): string | undefined {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.query<{ data: string }, []>(ROW_SQL).get()?.data;
  } finally {
    db.close();
  }
}

function isBusy(error: unknown): boolean {
  const code =
    error instanceof Error && "code" in error ? error.code : undefined;
  return (
    code === "SQLITE_BUSY" || messageOf(error).includes("database is locked")
  );
}

function parseRow(data: string): OmpRow | undefined {
  const row: unknown = JSON.parse(data);
  if (typeof row !== "object" || row === null) return undefined;
  const { access, expires, accountId } = row as Record<string, unknown>;
  if (typeof access !== "string" || typeof expires !== "number")
    return undefined;
  return {
    access,
    accountId: typeof accountId === "string" ? accountId : undefined,
    expires,
  };
}

function credentialOf(row: OmpRow): Credential {
  return {
    access: row.access,
    accountId: row.accountId,
    expires: row.expires,
    refresh: "",
    type: "oauth",
  };
}

function mtimeOf(path: string): number {
  return statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? 0;
}

export class OmpCredentialStore implements CredentialStore {
  private readonly dbPath: string;
  private readonly now: () => number;
  private cache: { key: string; row: OmpRow | undefined } | undefined;
  private dbReads = 0;

  constructor(init: OmpStoreInit) {
    this.dbPath = init.dbPath;
    this.now = init.now;
  }

  read(
    providerId: string,
    _options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    const row = providerId === PROVIDER ? this.cached() : undefined;
    return Promise.resolve(row && credentialOf(row));
  }

  list(_options?: AuthOperationOptions): Promise<readonly CredentialInfo[]> {
    return Promise.resolve(
      this.cached() ? [{ providerId: PROVIDER, type: "oauth" }] : [],
    );
  }

  modify(
    providerId: string,
    _fn: Modify,
    _options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    if (providerId !== PROVIDER) return Promise.resolve(undefined);
    const row = this.fresh();
    if (!row) return Promise.reject(new Error(MISSING));
    if (row.expires - this.now() <= REFRESH_WINDOW_MS)
      return Promise.reject(new CredentialExpiredError(PROVIDER, row.expires));
    return Promise.resolve(credentialOf(row));
  }

  delete(_providerId: string, _options?: AuthOperationOptions): Promise<void> {
    return Promise.reject(new Error("The harness does not own this login."));
  }

  reads(): number {
    return this.dbReads;
  }

  private cached(): OmpRow | undefined {
    const key = `${mtimeOf(this.dbPath)}:${mtimeOf(`${this.dbPath}-wal`)}`;
    if (this.cache?.key !== key) this.cache = { key, row: this.fresh() };
    return this.cache.row;
  }

  private fresh(): OmpRow | undefined {
    this.dbReads += 1;
    return readOmpRow(this.dbPath);
  }
}
