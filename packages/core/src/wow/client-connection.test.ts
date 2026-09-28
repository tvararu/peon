import { describe, expect, jest, test } from "bun:test";
import type { Socket } from "bun";
import { LoginStore } from "#wow/areas/login/store";
import { createWorldConn, startPingLoop } from "#wow/client-connection";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

const HEADER = 6;

function capturingConn() {
  const conn = createWorldConn();
  const frames: Uint8Array[] = [];
  conn.socket = {
    write: (bytes: Uint8Array) => frames.push(bytes),
  } as unknown as Socket;
  const pings = () =>
    frames
      .filter(
        (f) =>
          new DataView(f.buffer, f.byteOffset).getUint32(2, true) ===
          GameOpcode.CMSG_PING,
      )
      .map((f) => {
        const r = new PacketReader(f.subarray(HEADER));
        const seq = r.uint32LE();
        return { latencyMs: r.uint32LE(), seq };
      });
  return { conn, pings };
}

describe("startPingLoop", () => {
  test("writes CMSG_PING with sequences 1 and 2, the second carrying the round trip", () => {
    jest.useFakeTimers();
    const { conn, pings } = capturingConn();
    const login = new LoginStore(() => Date.now());
    const timer = startPingLoop(conn, login, { pingIntervalMs: 100 });
    try {
      jest.advanceTimersByTime(100);
      jest.advanceTimersByTime(25);
      login.receivePong({ seq: 1 });
      jest.advanceTimersByTime(75);
      expect(pings()).toEqual([
        { latencyMs: 0, seq: 1 },
        { latencyMs: 25, seq: 2 },
      ]);
    } finally {
      clearInterval(timer);
      jest.useRealTimers();
    }
  });
});
