import { describe, expect, test } from "bun:test";
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunMeta } from "#harness/contract/config";
import {
  createRunDir,
  finalizeSession,
  linkSession,
  pruneRuns,
  RunDirError,
  runPaths,
  runStamp,
  runsRoot,
  writeJsonAtomic,
  writeMeta,
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

function meta(dir: string): RunMeta {
  const flags = {
    check: false,
    connect: true,
    glyphs: undefined,
    logEntities: false,
    model: "openai-codex/gpt-6-luna",
    nowPerCall: false,
    profile: join(dir, "account.json"),
    runDir: dir,
    stopReflex: true,
    thinking: "high" as const,
    wake: true,
  };
  const files = {
    gamelog: "gamelog.jsonl",
    jev: "jev.jsonl",
    runs: "runs.jsonl",
    session: "session.jsonl",
    status: "status.json",
    tools: "tools.json",
  };
  return {
    account: "TCFRESH1",
    capabilities: undefined,
    character: "Fgk",
    characterGuid: "1",
    endedAt: undefined,
    exitReason: undefined,
    files,
    flags,
    gitSha: "abc1234",
    glyphs: "nerd",
    model: flags.model,
    startedAt: 1000,
    thinking: "high",
    v: 1,
  };
}

describe("writeMeta", () => {
  test("writes meta.json without any password field", async () => {
    const paths = runPaths(await home());
    await writeMeta(paths, meta(paths.dir));
    const text = await readFile(paths.meta, "utf8");
    expect(JSON.parse(text)).toMatchObject({
      account: "TCFRESH1",
      character: "Fgk",
      files: { gamelog: "gamelog.jsonl" },
      v: 1,
    });
    expect(text.toLowerCase()).not.toContain("password");
  });
});

describe("linkSession and finalizeSession", () => {
  test("re-points the link and replaces it with a copy at exit", async () => {
    const dir = await home();
    const paths = runPaths(dir);
    const first = join(dir, "pi-a.jsonl");
    const second = join(dir, "pi-b.jsonl");
    await writeFile(first, "a\n");
    await writeFile(second, "b\n");
    await linkSession(paths, first);
    await linkSession(paths, second);
    expect((await lstat(paths.session)).isSymbolicLink()).toBe(true);
    expect(await readFile(paths.session, "utf8")).toBe("b\n");
    await finalizeSession(paths);
    expect((await lstat(paths.session)).isSymbolicLink()).toBe(false);
    expect(await readFile(paths.session, "utf8")).toBe("b\n");
  });

  test("removes a link to a file Pi never wrote, and ignores no link", async () => {
    const paths = runPaths(await home());
    await finalizeSession(paths);
    await linkSession(paths, join(paths.dir, "missing.jsonl"));
    await finalizeSession(paths);
    expect(await Bun.file(paths.session).exists()).toBe(false);
  });
});
