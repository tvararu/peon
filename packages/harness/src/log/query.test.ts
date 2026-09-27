import { describe, expect, test } from "bun:test";
import type { LogDraft } from "#harness/contract/log";
import type { RunEnd } from "#harness/contract/runs";
import { formatLogRows, queryLog } from "#harness/log/query";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { Refusal } from "#harness/ops/refusal";
import { createRunRegistry } from "#harness/runs/registry";

function setup() {
  let now = 0;
  const clock = { now: () => now };
  const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
  const runs = createRunRegistry({
    clock,
    log,
    sink: createJsonlSink({ file: undefined }),
  });
  const add = (draft: Partial<LogDraft> & { text: string }, at: number) => {
    now = at;
    return log.append({
      class: "log",
      data: {},
      domain: "chat",
      event: "chat/in",
      ...draft,
    });
  };
  return {
    add,
    log,
    runs,
    setNow: (at: number) => {
      now = at;
    },
  };
}

describe("queryLog", () => {
  test("defaults to rows since the last turn and hides tool rows", () => {
    const { add, log, runs } = setup();
    add({ text: "old" }, 1000);
    const turnStartSeq = log.lastSeq();
    add({ text: "new" }, 2000);
    add({ domain: "tool", event: "tool/call", text: "look()" }, 2100);
    const page = queryLog({ log, now: 3000, query: {}, runs, turnStartSeq });
    expect(page.rows.map((row) => row.text)).toEqual(["new"]);
    expect(page.label).toBe("since your last turn started");
    expect(page.more).toBe(0);
  });

  test("reads a time window", () => {
    const { add, log, runs } = setup();
    add({ text: "early" }, 0);
    add({ text: "late" }, 280_000);
    const page = queryLog({
      log,
      now: 300_000,
      query: { since: "1m" },
      runs,
      turnStartSeq: 0,
    });
    expect(page.rows.map((row) => row.text)).toEqual(["late"]);
    expect(page.label).toBe("in the last 1m");
  });

  test("reads from a run's start", () => {
    const { add, log, runs, setNow } = setup();
    add({ text: "before" }, 1000);
    setNow(2000);
    runs.start({
      args: {},
      kind: "engage",
      launch: () => new Promise<RunEnd<number>>(() => {}),
      toolCallId: "c1",
    });
    add({ text: "during" }, 3000);
    const page = queryLog({
      log,
      now: 74_000,
      query: { since: "r1" },
      runs,
      turnStartSeq: 0,
    });
    expect(page.rows.map((row) => row.text)).toEqual(["during"]);
    expect(page.label).toBe("since r1 started (1m 12s ago)");
  });

  test("refuses an unknown run and a bad since", () => {
    const { log, runs } = setup();
    const ask = (since: string) => () =>
      queryLog({ log, now: 0, query: { since }, runs, turnStartSeq: 0 });
    expect(ask("r9")).toThrow(Refusal);
    expect(ask("yesterday")).toThrow(Refusal);
    try {
      ask("r9")();
    } catch (error) {
      expect(error).toMatchObject({
        next: 'journal(about: "log", since: "5m")',
        reason: "unknown_run",
      });
    }
  });

  test("finds words, a sender and a domain", () => {
    const { add, log, runs } = setup();
    add(
      { data: { sender: "Kaelyn" }, text: 'Whisper from Kaelyn: "hey there"' },
      10,
    );
    add({ data: { sender: "Bob" }, text: 'Bob says: "hey"' }, 20);
    add(
      {
        domain: "quest",
        event: "quest/progress",
        text: "Unfortunate Measures: 3/8.",
      },
      30,
    );
    add({ domain: "tool", event: "tool/call", text: "hey tool" }, 40);
    const find = (text: string) =>
      queryLog({
        log,
        now: 50,
        query: { find: text },
        runs,
        turnStartSeq: 0,
      }).rows.map((row) => row.text);
    expect(find("HEY there")).toEqual(['Whisper from Kaelyn: "hey there"']);
    expect(find("from:kaelyn")).toEqual(['Whisper from Kaelyn: "hey there"']);
    expect(find("domain:quest")).toEqual(["Unfortunate Measures: 3/8."]);
    expect(find("domain:tool")).toEqual(["hey tool"]);
    expect(
      queryLog({ log, now: 50, query: { find: "hey" }, runs, turnStartSeq: 0 })
        .label,
    ).toBe('since your last turn started, matching "hey"');
  });

  test("keeps the newest rows up to the limit, oldest first", () => {
    const { add, log, runs } = setup();
    for (const n of [1, 2, 3, 4, 5]) add({ text: `row ${n}` }, n);
    const page = queryLog({
      log,
      now: 10,
      query: { limit: 2 },
      runs,
      turnStartSeq: 0,
    });
    expect(page.rows.map((row) => row.text)).toEqual(["row 4", "row 5"]);
    expect(page.more).toBe(3);
  });
});

describe("formatLogRows", () => {
  test("prefixes relative seconds, minutes or hours", () => {
    const { add } = setup();
    const rows = [
      add({ text: "a" }, 28_000),
      add({ text: "b" }, -20_000),
      add({ text: "c" }, -8_000_000),
    ];
    expect(formatLogRows(rows, 100_000)).toEqual(["-72s a", "-2m b", "-2h c"]);
  });
});
