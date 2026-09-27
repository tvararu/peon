import { describe, expect, test } from "bun:test";
import { appendFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { StatusJson } from "#harness/contract/config";
import type { Domain, GameLogEntry, LogEvent } from "#harness/contract/log";
import {
  createLogTail,
  lastAnswerAt,
  progressOf,
  readStatus,
  TRIGGER_EVENTS,
  triggerRows,
} from "#harness/grader/watch";

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

function status(overrides: Partial<StatusJson> = {}): StatusJson {
  return {
    agent: "idle",
    at: 10_000,
    connection: "online",
    lastProgress: undefined,
    lastToolCallAt: undefined,
    ready: true,
    run: undefined,
    tool: undefined,
    v: 1,
    ...overrides,
  };
}

describe("TRIGGER_EVENTS", () => {
  test("follows the design I.2 table", () => {
    expect(TRIGGER_EVENTS).toEqual({
      answer_text: ["agent/message"],
      death: ["life/dead"],
      fight_start: ["fight/start"],
      kill: ["combat/kill_credit"],
      movement_start: ["nav/route_start", "control/move_start"],
      steer_landed: ["human/input"],
    });
  });
});

describe("triggerRows", () => {
  test("keeps only trigger events, with ts, seq and text", () => {
    const rows = [
      row(1, 100, "session/in_world"),
      row(2, 200, "fight/start", "fight Springpaw Stalker"),
      row(3, 300, "control/move_start"),
      row(4, 400, "xp/gain"),
    ];
    expect(triggerRows(rows)).toEqual([
      {
        ms: 200,
        seq: 2,
        text: "fight Springpaw Stalker",
        trigger: "fight_start",
      },
      {
        ms: 300,
        seq: 3,
        text: "control/move_start",
        trigger: "movement_start",
      },
    ]);
  });

  test("lastAnswerAt keeps the newest agent message", () => {
    expect(
      lastAnswerAt(
        [row(1, 100, "agent/message"), row(2, 250, "agent/message")],
        50,
      ),
    ).toBe(250);
    expect(lastAnswerAt([row(1, 100, "xp/gain")], 50)).toBe(50);
    expect(lastAnswerAt([], undefined)).toBeUndefined();
  });
});

describe("createLogTail", () => {
  test("reads only new complete lines", async () => {
    const file = `${await mkdtemp(`${tmpdir()}/tail-`)}/gamelog.jsonl`;
    const tail = createLogTail(file);
    expect(await tail.read()).toEqual([]);
    await writeFile(file, jsonl([row(1, 100, "session/in_world")]));
    expect((await tail.read()).map((entry) => entry.seq)).toEqual([1]);
    expect(await tail.read()).toEqual([]);
  });

  test("keeps a partial last line for the next read", async () => {
    const file = `${await mkdtemp(`${tmpdir()}/tail-`)}/gamelog.jsonl`;
    const tail = createLogTail(file);
    const second = JSON.stringify(row(2, 200, "combat/kill_credit"));
    await writeFile(
      file,
      `${jsonl([row(1, 100, "fight/start")])}${second.slice(0, 20)}`,
    );
    expect((await tail.read()).map((entry) => entry.seq)).toEqual([1]);
    await appendFile(file, `${second.slice(20)}\n`);
    expect((await tail.read()).map((entry) => entry.seq)).toEqual([2]);
  });

  test("reads multi-byte text across reads", async () => {
    const file = `${await mkdtemp(`${tmpdir()}/tail-`)}/gamelog.jsonl`;
    const tail = createLogTail(file);
    await writeFile(file, jsonl([row(1, 100, "chat/in", "Thélia says «hi»")]));
    expect((await tail.read())[0]?.text).toBe("Thélia says «hi»");
  });
});

describe("progressOf", () => {
  test("measures idle time from the newest progress or answer", () => {
    const progress = progressOf({
      lastAnswerAt: 7000,
      now: 10_000,
      status: status({
        agent: "tool",
        lastProgress: { at: 8000, event: "combat/kill_credit" },
        lastToolCallAt: 9000,
      }),
    });
    expect(progress).toEqual({
      agent: "tool",
      at: 10_000,
      idleSinceMs: 2000,
      lastProgress: { at: 8000, event: "combat/kill_credit" },
      lastToolCallAt: 9000,
    });
  });

  test("has no idle time before any progress or answer", () => {
    expect(
      progressOf({ lastAnswerAt: undefined, now: 10_000, status: status() })
        .idleSinceMs,
    ).toBeUndefined();
  });
});

describe("readStatus", () => {
  test("reads a status file and ignores a missing or half-written one", async () => {
    const dir = await mkdtemp(`${tmpdir()}/status-`);
    expect(await readStatus(`${dir}/status.json`)).toBeUndefined();
    await writeFile(`${dir}/status.json`, '{"v":1,"at":');
    expect(await readStatus(`${dir}/status.json`)).toBeUndefined();
    await writeFile(`${dir}/status.json`, JSON.stringify(status({ at: 42 })));
    expect((await readStatus(`${dir}/status.json`))?.at).toBe(42);
  });
});
