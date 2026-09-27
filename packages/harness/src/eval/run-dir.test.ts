import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRunDir,
  pruneRuns,
  RunDirError,
  runPaths,
  runStamp,
  runsRoot,
  writeJsonAtomic,
} from "#harness/eval/run-dir";

const now = new Date(Date.UTC(2026, 8, 26, 19, 13, 31, 123));

async function home() {
  return mkdtemp(join(tmpdir(), "tc-harness-home-"));
}

describe("runStamp and runPaths", () => {
  test("stamps UTC to the second", () => {
    expect(runStamp(now)).toBe("20260926T191331Z");
  });

  test("names every file of the run dir", () => {
    expect(runPaths("/r")).toEqual({
      dir: "/r",
      gamelog: "/r/gamelog.jsonl",
      jev: "/r/jev.jsonl",
      meta: "/r/meta.json",
      piSessions: "/r/pi-sessions",
      runs: "/r/runs.jsonl",
      session: "/r/session.jsonl",
      snapshots: "/r/snapshots",
      status: "/r/status.json",
      tools: "/r/tools.json",
      workspace: "/r/workspace",
    });
  });
});

describe("createRunDir", () => {
  test("makes a stamped dir under the state root", async () => {
    const dir = await home();
    const paths = await createRunDir({
      character: "Fgk",
      flag: undefined,
      home: dir,
      now,
    });
    expect(paths.dir).toBe(join(runsRoot(dir), "20260926T191331Z-Fgk"));
    expect((await readdir(paths.dir)).sort()).toEqual([
      "pi-sessions",
      "snapshots",
      "workspace",
    ]);
  });

  test("takes an existing --run-dir and refuses one with a game log", async () => {
    const dir = join(await home(), "eval-run");
    await mkdir(dir);
    await writeFile(join(dir, "account.json"), "{}");
    const paths = await createRunDir({
      character: "Fgk",
      flag: dir,
      home: "/nowhere",
      now,
    });
    expect(paths.dir).toBe(dir);
    await writeFile(paths.gamelog, "");
    await expect(
      createRunDir({ character: "Fgk", flag: dir, home: "/nowhere", now }),
    ).rejects.toBeInstanceOf(RunDirError);
  });
});

describe("pruneRuns", () => {
  test("keeps the newest stamped dirs and ignores other names", async () => {
    const root = join(await home(), "runs");
    const names = [
      "20260101T000000Z-A",
      "20260102T000000Z-A",
      "20260103T000000Z-A",
      "notes",
    ];
    for (const name of names)
      await mkdir(join(root, name), { recursive: true });
    expect(await pruneRuns(root, 2)).toEqual([
      join(root, "20260101T000000Z-A"),
    ]);
    expect((await readdir(root)).sort()).toEqual([
      "20260102T000000Z-A",
      "20260103T000000Z-A",
      "notes",
    ]);
  });
});

describe("writeJsonAtomic", () => {
  test("writes pretty JSON and leaves no temp file", async () => {
    const dir = await home();
    const path = join(dir, "status.json");
    await Promise.all([
      writeJsonAtomic(path, { n: 1 }),
      writeJsonAtomic(path, { n: 2 }),
    ]);
    expect([1, 2]).toContain(JSON.parse(await readFile(path, "utf8")).n);
    expect(await readdir(dir)).toEqual(["status.json"]);
  });
});
