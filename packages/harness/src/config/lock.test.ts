import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { scratchDir } from "@peon/core/test-support/scratch";
import { acquireLock, LockError } from "#harness/config/lock";
import type { Profile } from "#harness/contract/config";

let root: string;
let procDir: string;
let stateDir: string;

const profile: Profile = {
  account: "FACABC0123456",
  character: "Fgklibhlflc",
  client: {
    account: "FACABC0123456",
    character: "Fgklibhlflc",
    host: "realm.example",
    password: "PW",
    port: 3724,
  },
  path: "/p.json",
  source: "soap_session",
};

beforeEach(async () => {
  root = scratchDir("harness-lock");
  procDir = join(root, "proc");
  stateDir = join(root, "state");
  await mkdir(procDir);
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

async function liveProcess(pid: number): Promise<void> {
  await mkdir(join(procDir, String(pid)));
}

describe("acquireLock", () => {
  test("creates a 0600 lock file named after account and character", async () => {
    const lock = await acquireLock({
      host: "h1",
      pid: 111,
      procDir,
      profile,
      runDir: "/runs/a",
      stateDir,
    });
    expect(lock.path).toBe(
      join(stateDir, "locks/FACABC0123456-Fgklibhlflc.lock"),
    );
    expect((await stat(lock.path)).mode % 0o1000).toBe(0o600);
    expect(JSON.parse(await readFile(lock.path, "utf8"))).toMatchObject({
      host: "h1",
      pid: 111,
      runDir: "/runs/a",
    });
  });

  test("refuses while another live harness holds the lock and keeps its file", async () => {
    await liveProcess(111);
    const first = await acquireLock({
      host: "h1",
      pid: 111,
      procDir,
      profile,
      runDir: "/runs/a",
      stateDir,
    });
    const second = acquireLock({
      host: "h1",
      pid: 222,
      procDir,
      profile,
      runDir: "/runs/b",
      stateDir,
    });
    await expect(second).rejects.toBeInstanceOf(LockError);
    await expect(second).rejects.toMatchObject({
      holder: "pid 111 on h1, run dir /runs/a",
    });
    expect(JSON.parse(await readFile(first.path, "utf8")).pid).toBe(111);
  });

  test("replaces a lock whose pid is dead", async () => {
    await acquireLock({
      host: "h1",
      pid: 111,
      procDir,
      profile,
      runDir: "/runs/a",
      stateDir,
    });
    const lock = await acquireLock({
      host: "h1",
      pid: 222,
      procDir,
      profile,
      runDir: "/runs/b",
      stateDir,
    });
    expect(JSON.parse(await readFile(lock.path, "utf8")).pid).toBe(222);
  });

  test("release and releaseSync remove only their own lock", async () => {
    const lock = await acquireLock({
      pid: 111,
      procDir,
      profile,
      runDir: "/r",
      stateDir,
    });
    await lock.release();
    expect(existsSync(lock.path)).toBe(false);
    const again = await acquireLock({
      pid: 222,
      procDir,
      profile,
      runDir: "/r",
      stateDir,
    });
    lock.releaseSync();
    expect(existsSync(again.path)).toBe(true);
    again.releaseSync();
    expect(existsSync(again.path)).toBe(false);
  });
});
