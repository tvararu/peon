import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { utimesSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CredentialExpiredError,
  OmpCredentialStore,
  ompDbPath,
  readOmpRow,
} from "#harness/credentials/omp-store";
import { codexRow, writeOmpDb } from "#test-support/omp-db";

const NOW = Date.parse("2026-09-26T19:00:00Z");
const HOUR = 3_600_000;

let home: string;
let dbPath: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "harness-omp-"));
  dbPath = ompDbPath(home);
});

afterEach(async () => {
  await rm(home, { force: true, recursive: true });
});

function store(): OmpCredentialStore {
  return new OmpCredentialStore({ dbPath, now: () => NOW });
}

function touch(path: string, seconds: number): void {
  const at = new Date(NOW + seconds * 1000);
  utimesSync(path, at, at);
}

describe("readOmpRow", () => {
  test("returns the newest enabled codex oauth row, access and expiry only", () => {
    writeOmpDb(dbPath, [
      codexRow({ access: "old-access", expires: NOW + HOUR, updatedAt: 1 }),
      codexRow({ access: "new-access", expires: NOW + 2 * HOUR, updatedAt: 2 }),
      {
        ...codexRow({
          access: "disabled-access",
          expires: NOW + 3 * HOUR,
          updatedAt: 3,
        }),
        disabled: "revoked",
      },
      {
        ...codexRow({
          access: "other-access",
          expires: NOW + 3 * HOUR,
          updatedAt: 4,
        }),
        provider: "anthropic",
      },
    ]);
    expect(readOmpRow(dbPath)).toEqual({
      access: "new-access",
      accountId: "acct-test",
      expires: NOW + 2 * HOUR,
    });
  });

  test("returns undefined when the database or the row is missing", () => {
    expect(readOmpRow(dbPath)).toBeUndefined();
    writeOmpDb(dbPath, []);
    expect(readOmpRow(dbPath)).toBeUndefined();
  });

  test("ompDbPath is under the omp agent dir", () => {
    expect(ompDbPath("/home/me")).toBe("/home/me/.omp/agent/agent.db");
  });
});

describe("OmpCredentialStore", () => {
  test("reads the codex row as an oauth credential with an empty refresh token", async () => {
    writeOmpDb(dbPath, [codexRow({ access: "a1", expires: NOW + HOUR })]);
    expect(await store().read("openai-codex")).toEqual({
      access: "a1",
      accountId: "acct-test",
      expires: NOW + HOUR,
      refresh: "",
      type: "oauth",
    });
    expect(await store().read("anthropic")).toBeUndefined();
  });

  test("caches the row until the database or its -wal file changes", async () => {
    writeOmpDb(dbPath, [codexRow({ access: "a1", expires: NOW + HOUR })]);
    touch(dbPath, 1);
    const s = store();
    await s.read("openai-codex");
    await s.read("openai-codex");
    expect(s.reads()).toBe(1);
    writeFileSync(`${dbPath}-wal`, "");
    touch(`${dbPath}-wal`, 2);
    await s.read("openai-codex");
    expect(s.reads()).toBe(2);
    writeOmpDb(dbPath, [codexRow({ access: "a2", expires: NOW + HOUR })]);
    touch(dbPath, 3);
    expect(await s.read("openai-codex")).toMatchObject({ access: "a2" });
  });

  test("modify never calls fn and returns the row while more than 5 min are left", async () => {
    writeOmpDb(dbPath, [codexRow({ access: "a1", expires: NOW + HOUR })]);
    const fn = jest.fn(async () => undefined);
    expect(await store().modify("openai-codex", fn)).toMatchObject({
      access: "a1",
    });
    expect(fn).not.toHaveBeenCalled();
  });

  test("modify refuses a login inside the refresh window without calling fn", async () => {
    writeOmpDb(dbPath, [codexRow({ access: "a1", expires: NOW + 120_000 })]);
    const fn = jest.fn(async () => undefined);
    const result = store().modify("openai-codex", fn);
    await expect(result).rejects.toBeInstanceOf(CredentialExpiredError);
    await expect(result).rejects.toThrow(
      "The Codex login expired at 2026-09-26T19:02:00.000Z. Run omp once so that it refreshes the login. Then send your message again.",
    );
    expect(fn).not.toHaveBeenCalled();
  });

  test("modify re-reads the database, so an omp refresh meanwhile is accepted", async () => {
    writeOmpDb(dbPath, [codexRow({ access: "a1", expires: NOW + 120_000 })]);
    const s = store();
    await s.read("openai-codex");
    writeOmpDb(dbPath, [codexRow({ access: "a2", expires: NOW + HOUR })]);
    expect(await s.modify("openai-codex", async () => undefined)).toMatchObject(
      { access: "a2" },
    );
  });

  test("delete refuses and list names only the codex provider", async () => {
    writeOmpDb(dbPath, [codexRow({ access: "a1", expires: NOW + HOUR })]);
    await expect(store().delete("openai-codex")).rejects.toThrow(
      "The harness does not own this login.",
    );
    expect(await store().list()).toEqual([
      { providerId: "openai-codex", type: "oauth" },
    ]);
  });

  test("the expired error text holds no token", async () => {
    writeOmpDb(dbPath, [
      codexRow({ access: "secret-access-value", expires: NOW }),
    ]);
    const error = await store()
      .modify("openai-codex", async () => undefined)
      .catch((caught: unknown) => caught);
    expect(String(error)).not.toContain("secret-access-value");
    expect(String(error)).not.toContain("refresh-never-read");
  });
});
