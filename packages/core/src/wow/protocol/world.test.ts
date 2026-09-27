import { describe, expect, jest, test } from "bun:test";
import { must } from "#test-support/must";
import { Arc4 } from "#wow/crypto/arc4";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";
import {
  AccumulatorBuffer,
  buildOutgoingPacket,
  buildWorldAuthPacket,
  decryptIncomingHeader,
  INCOMING_HEADER_SIZE,
  OpcodeDispatch,
  OUTGOING_HEADER_SIZE,
  parseCharacterList,
} from "#wow/protocol/world";

test("buildWorldAuthPacket produces valid packet", async () => {
  const sessionKey = new Uint8Array(40);
  const serverSeed = new Uint8Array(4);
  const result = buildWorldAuthPacket({
    account: "Test",
    sessionKey,
    serverSeed,
    realmId: 1,
  });
  expect(result.byteLength).toBeGreaterThan(6);
});

test("parseCharacterList extracts character names and GUIDs", () => {
  const w = new PacketWriter();
  w.uint8(1);

  w.uint32LE(0x01);
  w.uint32LE(0x00);
  w.cString("Arthas");
  w.uint8(1);
  w.uint8(2);
  w.uint8(0);
  w.uint32LE(0);
  w.uint8(0);
  w.uint8(80);
  w.uint32LE(1);
  w.uint32LE(0);
  w.floatLE(0);
  w.floatLE(0);
  w.floatLE(0);
  w.uint32LE(0);
  w.uint32LE(0);
  w.uint32LE(0);
  w.uint8(0);
  w.uint32LE(0);
  w.uint32LE(0);
  w.uint32LE(0);
  for (let i = 0; i < 23; i++) {
    w.uint32LE(0);
    w.uint8(0);
    w.uint32LE(0);
  }

  const r = new PacketReader(w.finish());
  const chars = parseCharacterList(r);
  expect(chars).toHaveLength(1);
  expect(must(chars[0]).name).toBe("Arthas");
  expect(must(chars[0]).guidLow).toBe(0x01);
  expect(must(chars[0]).guidHigh).toBe(0x00);
  expect(must(chars[0]).race).toBe(1);
  expect(must(chars[0]).classId).toBe(2);
  expect(must(chars[0]).gender).toBe(0);
  expect(must(chars[0]).level).toBe(80);
  expect(must(chars[0]).zone).toBe(1);
  expect(must(chars[0]).map).toBe(0);
});

test("OpcodeDispatch persistent handler fires on matching opcode", () => {
  const dispatch = new OpcodeDispatch();
  let called = false;
  dispatch.on(0x01, () => {
    called = true;
  });
  dispatch.handle(0x01, new PacketReader(new Uint8Array(0)));
  expect(called).toBe(true);
});

test("OpcodeDispatch expect resolves on matching opcode", async () => {
  const dispatch = new OpcodeDispatch();
  const promise = dispatch.expect(0x02);
  const reader = new PacketReader(new Uint8Array([0x42]));
  dispatch.handle(0x02, reader);
  const result = await promise;
  expect(result.uint8()).toBe(0x42);
});

test("OpcodeDispatch runs the handler before resolving a waiter at the body start", async () => {
  const dispatch = new OpcodeDispatch();
  const order: string[] = [];
  dispatch.on(0x03, (r) => {
    order.push(`handler ${r.uint8()}`);
  });
  const promise = dispatch.expect(0x03).then((r) => {
    order.push(`waiter ${r.uint8()}`);
  });
  dispatch.handle(0x03, new PacketReader(new Uint8Array([0xff])));
  await promise;
  expect(order).toEqual(["handler 255", "waiter 255"]);
});

test("OpcodeDispatch resolves overlapping waiters on one opcode in order", async () => {
  const dispatch = new OpcodeDispatch();
  const first = dispatch.expect(0x04);
  const second = dispatch.expect(0x04);
  dispatch.handle(0x04, new PacketReader(new Uint8Array([1])));
  dispatch.handle(0x04, new PacketReader(new Uint8Array([2])));
  expect((await first).uint8()).toBe(1);
  expect((await second).uint8()).toBe(2);
});

test("OpcodeDispatch timeout removes only its own waiter", async () => {
  jest.useFakeTimers();
  try {
    const dispatch = new OpcodeDispatch();
    const early = dispatch.expect(0xff, { timeoutMs: 50 });
    const late = dispatch.expect(0xff, { timeoutMs: 500 });
    jest.advanceTimersByTime(50);
    await expect(early).rejects.toThrow("Timed out waiting for opcode 0xff");
    dispatch.handle(0xff, new PacketReader(new Uint8Array([7])));
    expect((await late).uint8()).toBe(7);
  } finally {
    jest.useRealTimers();
  }
});

test("OpcodeDispatch leaves a waiter queued when its match rejects the packet", async () => {
  const dispatch = new OpcodeDispatch();
  const wantsTwo = dispatch.expect(0x05, { match: (r) => r.uint8() === 2 });
  const any = dispatch.expect(0x05);
  dispatch.handle(0x05, new PacketReader(new Uint8Array([1])));
  dispatch.handle(0x05, new PacketReader(new Uint8Array([2])));
  expect((await any).uint8()).toBe(1);
  expect((await wantsTwo).uint8()).toBe(2);
});

test("OpcodeDispatch rejects the waiter when the handler throws and keeps the next one queued", async () => {
  const dispatch = new OpcodeDispatch();
  dispatch.on(0x06, (r) => {
    if (r.uint8() === 0) throw new Error("malformed body");
  });
  const failed = dispatch.expect(0x06);
  const next = dispatch.expect(0x06);
  expect(() =>
    dispatch.handle(0x06, new PacketReader(new Uint8Array([0]))),
  ).toThrow("malformed body");
  await expect(failed).rejects.toThrow("malformed body");
  dispatch.handle(0x06, new PacketReader(new Uint8Array([3])));
  expect((await next).uint8()).toBe(3);
});

test("AccumulatorBuffer accumulates and drains", () => {
  const buf = new AccumulatorBuffer();
  buf.append(new Uint8Array([1, 2, 3]));
  buf.append(new Uint8Array([4, 5]));
  expect(buf.length).toBe(5);
  const drained = buf.drain(3);
  expect(drained).toEqual(new Uint8Array([1, 2, 3]));
  expect(buf.length).toBe(2);
  const rest = buf.drain(2);
  expect(rest).toEqual(new Uint8Array([4, 5]));
  expect(buf.length).toBe(0);
});

test("AccumulatorBuffer peek does not consume", () => {
  const buf = new AccumulatorBuffer();
  buf.append(new Uint8Array([10, 20, 30]));
  const peeked = buf.peek(2);
  expect(peeked).toEqual(new Uint8Array([10, 20]));
  expect(buf.length).toBe(3);
});

test("buildOutgoingPacket creates correct header without encryption", () => {
  const body = new Uint8Array([0xaa, 0xbb]);
  const pkt = buildOutgoingPacket(0x01_ed, body);
  expect(pkt.byteLength).toBe(OUTGOING_HEADER_SIZE + 2);
  const view = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  expect(view.getUint16(0, false)).toBe(6);
  expect(view.getUint32(2, true)).toBe(0x01_ed);
  expect(pkt[6]).toBe(0xaa);
  expect(pkt[7]).toBe(0xbb);
});

test("buildOutgoingPacket encrypts header with arc4", () => {
  const sessionKey = new Uint8Array(40);
  for (let i = 0; i < 40; i++) sessionKey[i] = i;
  const arc4 = new Arc4(sessionKey);
  const body = new Uint8Array([0xcc]);
  const pkt = buildOutgoingPacket(0x01_ed, body, arc4);
  expect(pkt.byteLength).toBe(OUTGOING_HEADER_SIZE + 1);
  expect(pkt[6]).toBe(0xcc);
});

test("decryptIncomingHeader parses without encryption", () => {
  const header = new Uint8Array(4);
  const view = new DataView(header.buffer);
  view.setUint16(0, 10, false);
  view.setUint16(2, 0x01_ee, true);
  const result = decryptIncomingHeader(header);
  expect(result.size).toBe(10);
  expect(result.opcode).toBe(0x01_ee);
});

test("INCOMING_HEADER_SIZE is 4", () => {
  expect(INCOMING_HEADER_SIZE).toBe(4);
});

test("OUTGOING_HEADER_SIZE is 6", () => {
  expect(OUTGOING_HEADER_SIZE).toBe(6);
});

describe("OpcodeDispatch", () => {
  test("has() returns false for unregistered opcode", () => {
    const d = new OpcodeDispatch();
    expect(d.has(0x99_99)).toBe(false);
  });

  test("has() returns true after on()", () => {
    const d = new OpcodeDispatch();
    d.on(0x42, () => {});
    expect(d.has(0x42)).toBe(true);
  });

  test("on() refuses a second handler and keeps the first", () => {
    const d = new OpcodeDispatch();
    const seen: string[] = [];
    d.on(0x42, () => seen.push("first"));
    expect(() => d.on(0x42, () => seen.push("second"))).toThrow(
      "Opcode 0x42 already has a handler; compose in its owner",
    );
    d.handle(0x42, new PacketReader(new Uint8Array(0)));
    expect(seen).toEqual(["first"]);
  });
});
