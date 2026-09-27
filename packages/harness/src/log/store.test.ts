import { describe, expect, jest, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createBufferedWriter,
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
    const dir = await mkdtemp(join(tmpdir(), "tc-harness-sink-"));
    const file = join(dir, "runs.jsonl");
    const sink = createJsonlSink({ file });
    sink.write({ id: "r1" });
    await sink.flush();
    sink.write({ id: "r2" });
    await sink.close();
    expect(await readFile(file, "utf8")).toBe('{"id":"r1"}\n{"id":"r2"}\n');
  });

  test("keeps nothing when there is no file", async () => {
    const sink = createJsonlSink({ file: undefined });
    sink.write({ id: "r1" });
    await expect(sink.flush()).resolves.toBeUndefined();
    await expect(sink.close()).resolves.toBeUndefined();
  });
});
