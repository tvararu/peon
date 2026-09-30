import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import { startMockWorldServer } from "#test-support/mock-world-server";
import { STUB_EXAMPLE } from "#test-support/never-handled";
import { info, moveBody, PEER } from "#test-support/remote-motion-fixtures";
import {
  base,
  fakeAuth,
  waitForEchoProbe,
} from "#test-support/world-handlers-fixtures";
import { worldSession } from "#wow/client";
import {
  opcodeName,
  opcodeNumber,
  type PacketCounts,
  type TraceRow,
  type TraceSender,
} from "#wow/packet-trace";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";
import { OpcodeDispatch } from "#wow/protocol/world";

type Move = { opcode: number; body: Uint8Array };

function compressedMoves(moves: Move[]): Uint8Array {
  const inner = new PacketWriter();
  for (const { opcode, body } of moves) {
    inner.uint8(body.length + 2);
    inner.uint16LE(opcode);
    inner.rawBytes(body);
  }
  const raw = inner.finish();
  const w = new PacketWriter();
  w.uint32LE(raw.length);
  w.rawBytes(deflateSync(raw));
  return w.finish();
}

type Recorder = {
  rows: TraceRow[];
  closes: PacketCounts[];
  senders: TraceSender[];
};

type Server = Awaited<ReturnType<typeof startMockWorldServer>>;
type Traced = {
  rec: Recorder;
  server: Server;
  inject: (opcode: number, body: Uint8Array) => Promise<void>;
};

async function traced(
  bodies: boolean,
  run: (t: Traced) => Promise<void> = async () => {},
): Promise<Recorder> {
  const server = await startMockWorldServer();
  const r: Recorder = { closes: [], rows: [], senders: [] };
  const trace = {
    attach: (send: TraceSender) => r.senders.push(send),
    bodies,
    close: (counts: PacketCounts) => r.closes.push(counts),
    row: (row: TraceRow) => r.rows.push(row),
  };
  const handle = await worldSession(
    { ...base, host: "127.0.0.1", port: server.port, trace },
    fakeAuth(server.port),
  );
  const inject = async (opcode: number, body: Uint8Array) => {
    server.inject(opcode, body);
    await waitForEchoProbe(handle);
  };
  try {
    await run({ inject, rec: r, server });
  } finally {
    handle.close();
    await handle.closed;
    server.stop();
  }
  return r;
}

function named(rows: TraceRow[], name: string): TraceRow[] {
  return rows.filter((row) => opcodeName(row.opcode) === name);
}

describe("opcodeName", () => {
  test("names a known opcode and hex-labels an unknown one", () => {
    expect(opcodeName(GameOpcode[STUB_EXAMPLE])).toBe(STUB_EXAMPLE);
    expect(opcodeName(0x7_ff)).toBe("0x7ff");
  });
});

describe("opcodeNumber", () => {
  test("reads a GameOpcode name or 0x hex and refuses anything else", () => {
    expect(opcodeNumber("CMSG_GOSSIP_HELLO")).toBe(
      GameOpcode.CMSG_GOSSIP_HELLO,
    );
    expect(opcodeNumber("0x1DC")).toBe(0x1_dc);
    expect(opcodeNumber("0x7ff")).toBe(0x7_ff);
    expect(opcodeNumber("CMSG_NOT_A_THING")).toBeUndefined();
    expect(opcodeNumber("1dc")).toBeUndefined();
    expect(opcodeNumber("0x10000")).toBeUndefined();
    expect(opcodeNumber("toString")).toBeUndefined();
  });
});

describe("OpcodeDispatch counts", () => {
  test("handle reports its outcome and counts every opcode it sees", () => {
    const dispatch = new OpcodeDispatch();
    dispatch.on(GameOpcode[STUB_EXAMPLE], () => {});
    const empty = () => new PacketReader(new Uint8Array(0));
    expect(dispatch.handle(GameOpcode[STUB_EXAMPLE], empty())).toBe("handled");
    expect(dispatch.handle(0x7_ff, empty())).toBe("unhandled");
    dispatch.handle(0x7_ff, empty());
    const { seen, unhandled } = dispatch.counts();
    expect([...seen]).toEqual([
      [GameOpcode[STUB_EXAMPLE], 1],
      [0x7_ff, 2],
    ]);
    expect([...unhandled]).toEqual([[0x7_ff, 2]]);
  });
});

describe("packet trace", () => {
  test("writes one row per packet each way and a size-only auth session row", async () => {
    const r = await traced(true);
    const [auth] = named(r.rows, "CMSG_AUTH_SESSION");
    expect(auth).toMatchObject({ dir: "out" });
    expect(auth?.size).toBeGreaterThan(0);
    expect(auth).not.toHaveProperty("body");
    expect(named(r.rows, "SMSG_AUTH_CHALLENGE")).toMatchObject([
      { dir: "in", outcome: "handled" },
    ]);
    const [login] = named(r.rows, "CMSG_PLAYER_LOGIN");
    expect(login).toMatchObject({ dir: "out", size: 8 });
    expect(login?.body).toHaveLength(16);
  });

  test("leaves bodies out in headers mode", async () => {
    const r = await traced(false);
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.filter((row) => row.body !== undefined)).toEqual([]);
  });

  test("marks an opcode nothing handles and hands out a sender", async () => {
    const r = await traced(false, async ({ inject, rec, server }) => {
      await inject(0x7_ff, Uint8Array.of(1, 2));
      rec.senders[0]?.(GameOpcode.CMSG_PLAYED_TIME, Uint8Array.of(1));
      await server.waitForCapture(
        (packet) => packet.opcode === GameOpcode.CMSG_PLAYED_TIME,
      );
    });
    expect(named(r.rows, "0x7ff")).toMatchObject([
      { dir: "in", outcome: "unhandled", size: 2 },
    ]);
    expect(named(r.rows, "CMSG_PLAYED_TIME")).toMatchObject([
      { dir: "out", size: 1 },
    ]);
  });

  test("writes a row per inner compressed move and skips unsupported ones", async () => {
    const moves = [
      { body: Uint8Array.of(9), opcode: 1 },
      { body: moveBody(PEER, info(1)), opcode: GameOpcode.MSG_MOVE_HEARTBEAT },
      { body: Uint8Array.of(1), opcode: GameOpcode.MSG_MOVE_HEARTBEAT },
    ];
    const r = await traced(false, async ({ inject }) => {
      await inject(GameOpcode.SMSG_COMPRESSED_MOVES, compressedMoves(moves));
    });
    const inner = r.rows.filter((row) => row.via === "compressed");
    expect(inner).toMatchObject([
      { opcode: 1, outcome: "skipped", size: 1 },
      { opcode: GameOpcode.MSG_MOVE_HEARTBEAT, outcome: "handled" },
      { opcode: GameOpcode.MSG_MOVE_HEARTBEAT, outcome: "error", size: 1 },
    ]);
    expect(named(r.rows, "SMSG_COMPRESSED_MOVES")).toMatchObject([
      { dir: "in", outcome: "error" },
    ]);
  });

  test("closes the sink once with counts in both directions", async () => {
    const r = await traced(false, async ({ inject }) => {
      await inject(0x7_ff, Uint8Array.of(1));
    });
    expect(r.closes).toHaveLength(1);
    const [counts] = r.closes;
    expect(counts?.seen["SMSG_AUTH_RESPONSE"]).toBe(1);
    expect(counts?.unhandled).toEqual({ "0x7ff": 1 });
    expect(counts?.sent["CMSG_AUTH_SESSION"]).toBe(1);
    expect(counts?.sent["CMSG_PLAYER_LOGIN"]).toBe(1);
  });
});
