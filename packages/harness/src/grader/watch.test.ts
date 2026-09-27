import { describe, expect, test } from "bun:test";
import { appendFile, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { StatusJson } from "#harness/contract/config";
import type { Domain, GameLogEntry, LogEvent } from "#harness/contract/log";
import { watchRun } from "#harness/grader/watch";
import { fakeExec, ok } from "#test-support/fake-exec";
import { fakePane } from "#test-support/fake-pane";

const WITNESS = "/wt/tmp/tc-FAC0000000002";

function row(
  seq: number,
  ts: number,
  event: LogEvent,
  text: string = event,
): GameLogEntry {
  return {
    char: "Fevala",
    class: "passive",
    data: {},
    domain: event.split("/")[0] as Domain,
    event,
    seq,
    text,
    ts,
    v: 1,
  };
}

const jsonl = (rows: GameLogEntry[]): string =>
  rows.map((entry) => `${JSON.stringify(entry)}\n`).join("");

async function lines(file: string): Promise<unknown[]> {
  return (await Bun.file(file).text())
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

async function runDir(): Promise<string> {
  const dir = await mkdtemp(`${tmpdir()}/watch-`);
  const status: StatusJson = {
    agent: "tool",
    at: 2500,
    connection: "online",
    lastProgress: { at: 2000, event: "fight/start" },
    lastToolCallAt: 1900,
    ready: true,
    run: undefined,
    tool: "engage",
    v: 1,
  };
  await writeFile(`${dir}/status.json`, JSON.stringify(status));
  await writeFile(
    `${dir}/gamelog.jsonl`,
    jsonl([
      row(1, 1000, "session/in_world"),
      row(2, 2000, "fight/start", "fight Springpaw Stalker"),
    ]),
  );
  return dir;
}

describe("watchRun", () => {
  test("writes triggers once each, progress, frames and witness samples", async () => {
    const dir = await runDir();
    const { calls, exec } = fakeExec(() =>
      ok('{"data":[{"name":"Springpaw Stalker"}]}'),
    );
    const watcher = watchRun({
      clock: { now: () => 5000 },
      exec,
      frameEveryMs: 60_000,
      pane: fakePane(["first", "second"]),
      runDir: dir,
      witness: WITNESS,
    });
    await appendFile(
      `${dir}/gamelog.jsonl`,
      `${jsonl([row(3, 3000, "combat/kill_credit", "kill Springpaw Stalker")])}{"partial":`,
    );
    await watcher.stop();
    expect(await lines(`${dir}/triggers.jsonl`)).toEqual([
      {
        ms: 2000,
        seq: 2,
        text: "fight Springpaw Stalker",
        trigger: "fight_start",
      },
      { ms: 3000, seq: 3, text: "kill Springpaw Stalker", trigger: "kill" },
    ]);
    expect(await Bun.file(`${dir}/progress.json`).json()).toEqual({
      agent: "tool",
      at: 5000,
      idleSinceMs: 3000,
      lastProgress: { at: 2000, event: "fight/start" },
      lastToolCallAt: 1900,
    });
    expect((await readdir(`${dir}/frames`)).toSorted()).toEqual([
      "00000-5000.txt",
      "00001-5000.txt",
    ]);
    expect(await lines(`${dir}/witness.jsonl`)).toEqual([
      { code: 0, ms: 5000, nearby: { data: [{ name: "Springpaw Stalker" }] } },
      { code: 0, ms: 5000, nearby: { data: [{ name: "Springpaw Stalker" }] } },
    ]);
    expect(calls.map((call) => call.argv)).toEqual([
      [WITNESS, "nearby", "--json"],
      [WITNESS, "nearby", "--json"],
    ]);
  });

  test("samples no witness without a wrapper and keeps one frame for an unchanged screen", async () => {
    const dir = await runDir();
    const { calls, exec } = fakeExec(() => ok());
    const watcher = watchRun({
      clock: { now: () => 5000 },
      exec,
      pane: fakePane(["same"]),
      runDir: dir,
    });
    await watcher.stop();
    expect(calls).toEqual([]);
    expect(await readdir(`${dir}/frames`)).toEqual(["00000-5000.txt"]);
  });

  test("logs a failed job and keeps going", async () => {
    const dir = await runDir();
    const { exec } = fakeExec(() => ok());
    const pane = {
      ...fakePane(["x"]),
      screen: () => Promise.reject(new Error("terminal_handle_stale")),
    };
    const watcher = watchRun({
      clock: { now: () => 5000 },
      exec,
      pane,
      runDir: dir,
    });
    await watcher.stop();
    expect(await Bun.file(`${dir}/grader/watch-errors.log`).text()).toContain(
      "terminal_handle_stale",
    );
    expect(await lines(`${dir}/triggers.jsonl`)).toHaveLength(1);
  });
});
