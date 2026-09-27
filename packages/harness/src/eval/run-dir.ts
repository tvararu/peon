import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { harnessStateDir } from "#harness/config/flags";
import type { RunPaths } from "#harness/contract/config";

export class RunDirError extends Error {}

export const KEEP_RUNS = 50;

const STAMPED = /^\d{8}T\d{6}Z-/;
const STAMP_MARKS = /[-:]/g;

type RunDirInit = {
  flag: string | undefined;
  home: string;
  character: string;
  now: Date;
};

let tempCount = 0;

export function runsRoot(home: string): string {
  return join(harnessStateDir(home), "runs");
}

export function runStamp(now: Date): string {
  return `${now.toISOString().replace(STAMP_MARKS, "").slice(0, 15)}Z`;
}

export function runPaths(dir: string): RunPaths {
  const at = (name: string) => join(dir, name);
  return {
    dir,
    gamelog: at("gamelog.jsonl"),
    jev: at("jev.jsonl"),
    meta: at("meta.json"),
    piSessions: at("pi-sessions"),
    runs: at("runs.jsonl"),
    session: at("session.jsonl"),
    snapshots: at("snapshots"),
    status: at("status.json"),
    tools: at("tools.json"),
    workspace: at("workspace"),
  };
}

export async function pruneRuns(
  root: string,
  keep = KEEP_RUNS,
): Promise<string[]> {
  const names = (await readdir(root))
    .filter((name) => STAMPED.test(name))
    .sort();
  const old = names
    .slice(0, Math.max(0, names.length - keep))
    .map((name) => join(root, name));
  await Promise.all(
    old.map((path) => rm(path, { force: true, recursive: true })),
  );
  return old;
}

export async function createRunDir({
  flag,
  home,
  character,
  now,
}: RunDirInit): Promise<RunPaths> {
  const dir = resolve(
    flag ?? join(runsRoot(home), `${runStamp(now)}-${character}`),
  );
  const paths = runPaths(dir);
  if (await Bun.file(paths.gamelog).exists())
    throw new RunDirError(
      `${dir} already holds gamelog.jsonl. Give a new --run-dir.`,
    );
  await Promise.all(
    [paths.piSessions, paths.snapshots, paths.workspace].map((sub) =>
      mkdir(sub, { recursive: true }),
    ),
  );
  if (flag === undefined) await pruneRuns(runsRoot(home));
  return paths;
}

export async function writeJsonAtomic(
  path: string,
  value: unknown,
): Promise<void> {
  tempCount += 1;
  const temp = `${path}.${process.pid}.${tempCount}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temp, path);
}
