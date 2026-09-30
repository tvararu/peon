import { describe, expect, jest, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { scratchDir } from "@peon/core/test-support/scratch";
import { runPaths } from "#harness/eval/run-dir";
import { createPacketTrace, TRACE_FLUSH_MS } from "#harness/log/packet-trace";

const LOGIN = 0x3d;
const CAMERA_SHAKE = 0x5_0a;

function paths() {
  return runPaths(scratchDir("tc-harness-packets"));
}

async function lines(path: string): Promise<unknown[]> {
  const text = await readFile(path, "utf8");
  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

async function exists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

const counts = {
  seen: { SMSG_CAMERA_SHAKE: 2 },
  sent: { CMSG_PLAYER_LOGIN: 1 },
  unhandled: {},
};

describe("createPacketTrace", () => {
  test("off writes counts but no trace rows", async () => {
    const p = paths();
    const trace = createPacketTrace({ mode: "off", paths: p });
    trace.row({
      at: 1,
      dir: "in",
      opcode: CAMERA_SHAKE,
      outcome: "handled",
      size: 4,
    });
    trace.close?.(counts);
    await trace.flush();
    expect(trace.bodies).toBe(false);
    expect(await exists(p.packets)).toBe(false);
    expect(await Bun.file(p.packetCounts).json()).toEqual({
      ...counts,
      sessions: 1,
    });
  });

  test("headers writes one named row per packet without bodies", async () => {
    const p = paths();
    const trace = createPacketTrace({ mode: "headers", paths: p });
    trace.row({ at: 1, dir: "out", opcode: LOGIN, size: 8 });
    trace.row({
      at: 2,
      dir: "in",
      opcode: 0x7_ff,
      outcome: "unhandled",
      size: 0,
      via: "compressed",
    });
    await trace.flush();
    expect(trace.bodies).toBe(false);
    expect(await lines(p.packets)).toEqual([
      { at: 1, dir: "out", opcode: "CMSG_PLAYER_LOGIN", size: 8 },
      {
        at: 2,
        dir: "in",
        opcode: "0x7ff",
        outcome: "unhandled",
        size: 0,
        via: "compressed",
      },
    ]);
  });

  test("bodies keeps the hex body", async () => {
    const p = paths();
    const trace = createPacketTrace({ mode: "bodies", paths: p });
    trace.row({ at: 1, body: "0a0b", dir: "out", opcode: LOGIN, size: 2 });
    await trace.flush();
    expect(trace.bodies).toBe(true);
    expect(await lines(p.packets)).toMatchObject([{ body: "0a0b" }]);
  });

  test("appends rows at most once per flush interval", async () => {
    const p = paths();
    jest.useFakeTimers();
    try {
      const trace = createPacketTrace({ mode: "headers", paths: p });
      trace.row({ at: 1, dir: "out", opcode: LOGIN, size: 8 });
      jest.advanceTimersByTime(TRACE_FLUSH_MS - 1);
      expect(await exists(p.packets)).toBe(false);
      jest.advanceTimersByTime(1);
      await trace.flush();
      expect(await lines(p.packets)).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("adds up the counts of every session", async () => {
    const p = paths();
    const trace = createPacketTrace({ mode: "off", paths: p });
    trace.close?.(counts);
    trace.close?.({
      seen: { SMSG_CAMERA_SHAKE: 1, SMSG_PONG: 3 },
      sent: {},
      unhandled: { "0x7ff": 1 },
    });
    await trace.flush();
    expect(await Bun.file(p.packetCounts).json()).toEqual({
      seen: { SMSG_CAMERA_SHAKE: 3, SMSG_PONG: 3 },
      sent: { CMSG_PLAYER_LOGIN: 1 },
      sessions: 2,
      unhandled: { "0x7ff": 1 },
    });
  });
});
