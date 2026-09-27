import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type OmpDbRow = {
  provider: string;
  type: string;
  data: Record<string, unknown>;
  disabled?: string;
  updatedAt: number;
};

export function codexRow(init: {
  access: string;
  expires: number;
  updatedAt?: number;
}): OmpDbRow {
  const data = {
    access: init.access,
    accountId: "acct-test",
    email: "test@example.invalid",
    expires: init.expires,
    refresh: "refresh-never-read",
  };
  return {
    data,
    provider: "openai-codex",
    type: "oauth",
    updatedAt: init.updatedAt ?? 1,
  };
}

export function writeOmpDb(path: string, rows: readonly OmpDbRow[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.run("pragma synchronous = off");
  db.run("pragma journal_mode = memory");
  db.run(
    "create table if not exists auth_credentials (id integer primary key, provider text, credential_type text, data text, disabled_cause text, identity_key text, created_at integer, updated_at integer)",
  );
  db.run("delete from auth_credentials");
  const insert = db.query(
    "insert into auth_credentials (provider, credential_type, data, disabled_cause, identity_key, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const row of rows)
    insert.run(
      row.provider,
      row.type,
      JSON.stringify(row.data),
      row.disabled ?? null,
      "id-key",
      row.updatedAt,
      row.updatedAt,
    );
  db.close();
}
