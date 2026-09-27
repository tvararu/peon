import { existsSync, readFileSync, rmSync } from "node:fs";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname } from "node:path";
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { Profile } from "#harness/contract/config";

export type LockInit = {
  profile: Profile;
  stateDir: string;
  runDir: string;
  pid?: number;
  host?: string;
  procDir?: string;
};
export type Lock = {
  path: string;
  release: () => Promise<void>;
  releaseSync: () => void;
};

type LockFile = {
  pid: number;
  startedAt: string;
  runDir: string;
  host: string;
};
type Claim = { path: string; body: LockFile; procDir: string };

export class LockError extends Error {
  readonly holder: string;

  constructor(holder: string) {
    super(`Another harness (${holder}) holds this character. Stop it first.`);
    this.name = "LockError";
    this.holder = holder;
  }
}

export async function acquireLock(init: LockInit): Promise<Lock> {
  const procDir = init.procDir ?? "/proc";
  const pid = init.pid ?? process.pid;
  const path = `${init.stateDir}/locks/${init.profile.account.toUpperCase()}-${init.profile.character}.lock`;
  await mkdir(dirname(path), { mode: 0o700, recursive: true });
  const body = {
    host: init.host ?? hostname(),
    pid,
    runDir: init.runDir,
    startedAt: new Date().toISOString(),
  };
  await claim({ body, path, procDir });
  return {
    path,
    release: () => release(path, pid),
    releaseSync: () => releaseSync(path, pid),
  };
}

async function claim({ path, body, procDir }: Claim): Promise<void> {
  if (await tryCreate(path, body)) return;
  const holder = parseLock(await readFile(path, "utf8").catch(ignoreFailure));
  if (holder && existsSync(`${procDir}/${holder.pid}`))
    throw new LockError(
      `pid ${holder.pid} on ${holder.host}, run dir ${holder.runDir}`,
    );
  await rm(path, { force: true });
  if (!(await tryCreate(path, body)))
    throw new LockError("a harness that started at the same time");
}

async function tryCreate(path: string, body: LockFile): Promise<boolean> {
  try {
    const file = await open(path, "wx", 0o600);
    await file.writeFile(`${JSON.stringify(body)}\n`);
    await file.close();
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST")
      return false;
    throw error;
  }
}

function parseLock(text: string | undefined): LockFile | undefined {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as LockFile;
  } catch {
    return undefined;
  }
}

async function release(path: string, pid: number): Promise<void> {
  const holder = parseLock(await readFile(path, "utf8").catch(ignoreFailure));
  if (holder?.pid === pid) await rm(path, { force: true });
}

function releaseSync(path: string, pid: number): void {
  if (parseLock(readQuiet(path))?.pid === pid) rmSync(path, { force: true });
}

function readQuiet(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}
