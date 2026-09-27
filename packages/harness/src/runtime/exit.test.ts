import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { RunMeta } from "#harness/contract/config";
import {
  createExitRecorder,
  EXIT_SIGINT,
  type ExitProcess,
  LOGOUT_NOTICE,
} from "#harness/runtime/exit";

const START = 1000;

function meta(): RunMeta {
  return {
    account: "FACABC0123456",
    capabilities: undefined,
    character: "Fgklibhlflc",
    characterGuid: undefined,
    endedAt: undefined,
    exitReason: undefined,
    files: {
      gamelog: "gamelog.jsonl",
      jev: "jev.jsonl",
      runs: "runs.jsonl",
      session: "session.jsonl",
      status: "status.json",
      tools: "tools.json",
    },
    flags: {} as RunMeta["flags"],
    gitSha: undefined,
    glyphs: "ascii",
    model: "openai-codex/gpt-6-luna",
    startedAt: START,
    thinking: "high",
    v: 1,
  };
}

function setup() {
  const emitter = new EventEmitter();
  const exits: number[] = [];
  const proc: ExitProcess = {
    exit: (code) => {
      exits.push(code);
      emitter.emit("exit", code);
    },
    on: (event, listener) => emitter.on(event, listener),
  };
  let clock = START;
  const written: RunMeta[] = [];
  const synced: RunMeta[] = [];
  const notices: string[] = [];
  const recorder = createExitRecorder({
    meta: meta(),
    notice: (line) => notices.push(line),
    now: () => {
      clock += 10;
      return clock;
    },
    proc,
    write: async (value) => {
      written.push(value);
    },
    writeSync: (value) => synced.push(value),
  });
  return { emitter, exits, notices, proc, recorder, synced, written };
}

describe("createExitRecorder", () => {
  test("a quit writes endedAt and exitReason before the logout and again at the end", async () => {
    const t = setup();
    await t.recorder.begin();
    expect(t.written[0]).toMatchObject({ exitReason: "quit" });
    expect(t.written[0]?.endedAt).toBeGreaterThan(START);
    expect(t.notices).toEqual([LOGOUT_NOTICE]);
    await t.recorder.end({ characterGuid: "0x10" });
    expect(t.written[1]).toMatchObject({
      characterGuid: "0x10",
      exitReason: "quit",
    });
    expect(t.written[1]?.endedAt).toBeGreaterThan(t.written[0]?.endedAt ?? 0);
    t.emitter.emit("exit", 0);
    expect(t.synced).toEqual([]);
  });

  test("SIGTERM records sigterm and leaves the shutdown to Pi", async () => {
    const t = setup();
    t.recorder.piOwnsSignals();
    t.emitter.emit("SIGTERM");
    expect(t.exits).toEqual([]);
    await t.recorder.begin();
    await t.recorder.end({});
    expect(t.written.map((row) => row.exitReason)).toEqual([
      "sigterm",
      "sigterm",
    ]);
    expect(t.notices).toEqual([]);
  });

  test("SIGHUP records sighup", async () => {
    const t = setup();
    t.recorder.piOwnsSignals();
    t.emitter.emit("SIGHUP");
    await t.recorder.begin();
    expect(t.written[0]?.exitReason).toBe("sighup");
  });

  test("SIGTERM before Pi listens still ends the process with the meta written", () => {
    const t = setup();
    t.emitter.on("SIGTERM", () => undefined);
    t.emitter.emit("SIGTERM");
    expect(t.exits).toEqual([143]);
    expect(t.synced[0]).toMatchObject({ exitReason: "sigterm" });
  });

  test("SIGINT during the logout writes the meta at once and exits 130", async () => {
    const t = setup();
    await t.recorder.begin();
    t.emitter.emit("SIGINT");
    expect(t.exits).toEqual([EXIT_SIGINT]);
    expect(t.synced).toHaveLength(1);
    expect(t.synced[0]).toMatchObject({ exitReason: "sigint" });
    expect(typeof t.synced[0]?.endedAt).toBe("number");
  });

  test("a fatal exit without a shutdown writes fatal_error", () => {
    const t = setup();
    t.emitter.emit("exit", 1);
    expect(t.synced).toHaveLength(1);
    expect(t.synced[0]).toMatchObject({ exitReason: "fatal_error" });
    expect(typeof t.synced[0]?.endedAt).toBe("number");
  });

  test("an exit 0 cut short during the logout still writes quit", async () => {
    const t = setup();
    await t.recorder.begin();
    t.emitter.emit("exit", 0);
    expect(t.synced[0]).toMatchObject({ exitReason: "quit" });
  });
});
