import { describe, expect, jest, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { scratchDir } from "@peon/core/test-support/scratch";
import type { LogDraft } from "#harness/contract/log";
import {
  createBufferedWriter,
  createGameLog,
  createJsonlSink,
  FLUSH_MS,
  jsonLine,
} from "#harness/log/store";

function recorder() {
  const writes: string[] = [];
  const write = async (text: string) => {
    writes.push(text);
  };
  return { write, writes };
}

describe("jsonLine", () => {
  test("writes a bigint as lowercase hex", () => {
    expect(jsonLine({ guid: 0x1fn })).toBe('{"guid":"1f"}\n');
  });
});

describe("createBufferedWriter", () => {
  test("writes nothing before flushMs and one batch at flushMs", async () => {
    const { write, writes } = recorder();
    jest.useFakeTimers();
    try {
      const writer = createBufferedWriter({ flushMs: FLUSH_MS, write });
      writer.push({ a: 1 });
      jest.advanceTimersByTime(FLUSH_MS - 1);
      writer.push({ a: 2 });
      jest.advanceTimersByTime(1);
      await writer.flush();
      expect(writes).toEqual(['{"a":1}\n{"a":2}\n']);
    } finally {
      jest.useRealTimers();
    }
  });

  test("serializes a row when it flushes, so later changes reach disk", async () => {
    const { write, writes } = recorder();
    const writer = createBufferedWriter({ flushMs: FLUSH_MS, write });
    const row: Record<string, unknown> = { a: 1 };
    writer.push(row);
    row["b"] = 2;
    await writer.flush();
    expect(writes).toEqual(['{"a":1,"b":2}\n']);
  });

  test("keeps the write order across flushes", async () => {
    const { write, writes } = recorder();
    const writer = createBufferedWriter({ flushMs: FLUSH_MS, write });
    writer.push({ n: 1 });
    const first = writer.flush();
    writer.push({ n: 2 });
    await Promise.all([first, writer.flush()]);
    expect(writes).toEqual(['{"n":1}\n', '{"n":2}\n']);
  });
});

describe("createJsonlSink", () => {
  test("appends rows to the file on flush and close", async () => {
    const dir = scratchDir("tc-harness-sink");
    const file = join(dir, "runs.jsonl");
    const sink = createJsonlSink({ file });
    sink.write({ id: "r1" });
    await sink.flush();
    sink.write({ id: "r2" });
    await sink.close();
    expect(await readFile(file, "utf8")).toBe('{"id":"r1"}\n{"id":"r2"}\n');
  });
});

function draft(text: string): LogDraft {
  return { class: "log", data: {}, domain: "chat", event: "chat/in", text };
}

function memoryLog(capacity?: number) {
  let now = 1000;
  const log = createGameLog({
    capacity,
    char: () => "Fgk",
    clock: { now: () => now },
    file: undefined,
  });
  return {
    log,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

describe("createGameLog", () => {
  test("stamps v, seq, ts and char on each row", () => {
    const { log, tick } = memoryLog();
    log.append(draft("a"));
    tick(5);
    expect(log.append(draft("b"))).toEqual({
      char: "Fgk",
      class: "log",
      data: {},
      domain: "chat",
      event: "chat/in",
      seq: 2,
      text: "b",
      ts: 1005,
      v: 1,
    });
  });

  test("keeps a draft's own ts", () => {
    const { log } = memoryLog();
    expect(log.append({ ...draft("a"), ts: 42 }).ts).toBe(42);
  });

  test("drops the oldest rows past the capacity", () => {
    const { log } = memoryLog(3);
    for (const text of ["a", "b", "c", "d", "e"]) log.append(draft(text));
    expect(log.count()).toBe(3);
    expect(log.lastSeq()).toBe(5);
    expect(log.get(2)).toBeUndefined();
    expect(log.since(0).map((row) => row.seq)).toEqual([3, 4, 5]);
    expect(log.since(4).map((row) => row.seq)).toEqual([5]);
    expect(log.recent(2).map((row) => row.seq)).toEqual([4, 5]);
    expect(log.recent(0)).toEqual([]);
  });

  test("gives each reader its own cursor; reads change nothing", () => {
    const { log } = memoryLog();
    log.append(draft("a"));
    log.append(draft("b"));
    const agent = log.since(0);
    const panel = log.since(1);
    expect(agent.map((row) => row.text)).toEqual(["a", "b"]);
    expect(panel.map((row) => row.text)).toEqual(["b"]);
    expect(log.since(0)).toHaveLength(2);
  });

  test("mark patches the stored row", () => {
    const { log } = memoryLog();
    log.append(draft("a"));
    log.mark(1, { consumedBy: "call-1", delivered: false });
    expect(log.get(1)).toMatchObject({
      consumedBy: "call-1",
      delivered: false,
    });
    log.mark(9, { consumedBy: "call-2" });
    expect(log.get(9)).toBeUndefined();
  });

  test("calls subscribers until they unsubscribe", () => {
    const { log } = memoryLog();
    const seen: number[] = [];
    const off = log.subscribe((entry) => seen.push(entry.seq));
    log.append(draft("a"));
    off();
    log.append(draft("b"));
    expect(seen).toEqual([1]);
  });

  test("writes rows to the file with marks made before the flush", async () => {
    const dir = scratchDir("tc-harness-log");
    const file = join(dir, "gamelog.jsonl");
    const log = createGameLog({
      char: () => "Fgk",
      clock: { now: () => 7 },
      file,
    });
    log.append(draft("a"));
    log.mark(1, { consumedBy: "call-1" });
    await log.flush();
    const [line] = (await readFile(file, "utf8")).trim().split("\n");
    expect(JSON.parse(line ?? "{}")).toMatchObject({
      consumedBy: "call-1",
      seq: 1,
      text: "a",
      v: 1,
    });
    await log.close();
  });
});
