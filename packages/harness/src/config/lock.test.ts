import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeConfig } from "@tuicraft/core/lib/config";
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
    host: "t1",
    password: "PW",
    port: 3724,
  },
  path: "/p.json",
  source: "soap_session",
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "harness-lock-"));
  procDir = join(root, "proc");
  stateDir = join(root, "state");
  await mkdir(procDir);
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

async function liveProcess(
  pid: number,
  files: Record<string, string> = {},
): Promise<void> {
  await mkdir(join(procDir, String(pid)));
  for (const [name, text] of Object.entries(files))
    await writeFile(join(procDir, String(pid), name), text);
}

async function daemonConfig(
  account: string,
  character: string,
): Promise<string> {
  const xdg = join(root, `config-${account}-${character}`);
  await mkdir(join(xdg, "tuicraft"), { recursive: true });
  const config = {
    account,
    character,
    host: "t1",
    language: 1,
    password: "pw",
    port: 3724,
    timeout_minutes: 30,
  };
  await writeFile(join(xdg, "tuicraft/config.toml"), serializeConfig(config));
  return xdg;
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
    await expect(second).rejects.toMatchObject({ code: "held_by_harness" });
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

  test("refuses when a daemon is logged in as the character", async () => {
    const xdg = await daemonConfig("facabc0123456", "Fgklibhlflc");
    await liveProcess(333, {
      cmdline: "bun\0main.ts\0--daemon\0",
      environ: `HOME=/nowhere\0XDG_CONFIG_HOME=${xdg}\0`,
    });
    await expect(
      acquireLock({ pid: 222, procDir, profile, runDir: "/r", stateDir }),
    ).rejects.toMatchObject({ code: "held_by_daemon", holder: "pid 333" });
  });

  test("ignores a daemon of another character and a non-daemon process", async () => {
    const xdg = await daemonConfig("OTHERACC", "Other");
    await liveProcess(333, {
      cmdline: "bun\0main.ts\0--daemon\0",
      environ: `XDG_CONFIG_HOME=${xdg}\0`,
    });
    await liveProcess(444, {
      cmdline: "bun\0main.ts\0status\0",
      environ: `XDG_CONFIG_HOME=${await daemonConfig("FACABC0123456", "Fgklibhlflc")}\0`,
    });
    await expect(
      acquireLock({ pid: 222, procDir, profile, runDir: "/r", stateDir }),
    ).resolves.toBeDefined();
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
