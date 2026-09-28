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

test("OpcodeDispatch treats a throwing match as a non-match", async () => {
  const dispatch = new OpcodeDispatch();
  const wantsId = dispatch.expect(0x07, { match: (r) => r.uint32LE() === 9 });
  expect(() =>
    dispatch.handle(0x07, new PacketReader(new Uint8Array([9]))),
  ).not.toThrow();
  dispatch.handle(0x07, new PacketReader(new Uint8Array([9, 0, 0, 0])));
  expect((await wantsId).uint32LE()).toBe(9);
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

  test("counts an opcode with no handler or waiter and reports it once", () => {
    const d = new OpcodeDispatch();
    const reported: number[] = [];
    d.onUnhandled((opcode) => reported.push(opcode) > 0);
    for (const opcode of [0x50, 0x50, 0x51, 0x50])
      d.handle(opcode, new PacketReader(new Uint8Array(0)));
    expect(reported).toEqual([0x50, 0x51]);
    expect([...d.unhandledCounts()]).toEqual([
      [0x50, 3],
      [0x51, 1],
    ]);
  });

  test("reports a held-back opcode on the next unhandled packet", () => {
    const d = new OpcodeDispatch();
    let taken = false;
    const reported: number[] = [];
    d.onUnhandled((opcode) => {
      reported.push(opcode);
      return taken;
    });
    d.handle(0x50, new PacketReader(new Uint8Array(0)));
    d.handle(0x51, new PacketReader(new Uint8Array(0)));
    taken = true;
    d.handle(0x52, new PacketReader(new Uint8Array(0)));
    d.handle(0x50, new PacketReader(new Uint8Array(0)));
    expect(reported).toEqual([0x50, 0x50, 0x50, 0x51, 0x52]);
  });

  test("counts nothing for an opcode a handler or waiter takes", async () => {
    const d = new OpcodeDispatch();
    d.on(0x42, () => {});
    const waited = d.expect(0x43);
    d.handle(0x42, new PacketReader(new Uint8Array(0)));
    d.handle(0x43, new PacketReader(new Uint8Array(0)));
    await waited;
    expect(d.unhandledCounts().size).toBe(0);
  });
});

describe("OpcodeDispatch.peek", () => {
  const body = (value: number) => {
    const w = new PacketWriter();
    w.uint32LE(value);
    return new PacketReader(w.finish());
  };

  test("runs after the owner", () => {
    const d = new OpcodeDispatch();
    const order: string[] = [];
    d.on(0x60, () => order.push("owner"));
    d.peek(0x60, () => order.push("peek"));
    d.handle(0x60, body(1));
    expect(order).toEqual(["owner", "peek"]);
  });

  test("reads a fresh fork after the owner consumed the body", () => {
    const d = new OpcodeDispatch();
    const read: number[] = [];
    d.on(0x61, (r) => read.push(r.uint32LE()));
    d.peek(0x61, (r) => read.push(r.uint32LE()));
    d.handle(0x61, body(0x12_34_56_78));
    expect(read).toEqual([0x12_34_56_78, 0x12_34_56_78]);
  });

  test("runs after the waiter step and the waiter still reads the body", async () => {
    const d = new OpcodeDispatch();
    const order: string[] = [];
    d.on(0x62, (r) => order.push(`owner ${r.uint32LE()}`));
    d.peek(0x62, (r) => order.push(`peek ${r.uint32LE()}`));
    const waited = d.expect(0x62, {
      match: () => order.push("waiter") > 0,
    });
    expect(d.handle(0x62, body(7))).toBe("handled");
    expect((await waited).uint32LE()).toBe(7);
    expect(order).toEqual(["owner 7", "waiter", "peek 7"]);
  });

  test("never runs when the owner throws", async () => {
    const d = new OpcodeDispatch();
    const peeked: number[] = [];
    d.on(0x63, () => {
      throw new Error("malformed body");
    });
    d.peek(0x63, (r) => peeked.push(r.uint32LE()));
    const waited = d.expect(0x63);
    expect(() => d.handle(0x63, body(1))).toThrow("malformed body");
    await expect(waited).rejects.toThrow("malformed body");
    expect(peeked).toEqual([]);
  });

  test("reports a throwing peek and still runs the next one", async () => {
    const d = new OpcodeDispatch();
    const reported: [number, unknown][] = [];
    const failure = new Error("bad peek");
    const peeked: number[] = [];
    d.onPeekError((opcode, error) => reported.push([opcode, error]));
    d.on(0x64, () => {});
    d.peek(0x64, () => {
      throw failure;
    });
    d.peek(0x64, (r) => peeked.push(r.uint32LE()));
    const waited = d.expect(0x64);
    expect(d.handle(0x64, body(5))).toBe("handled");
    expect((await waited).uint32LE()).toBe(5);
    expect(reported).toEqual([[0x64, failure]]);
    expect(peeked).toEqual([5]);
  });

  test("refuses an opcode with no owner", () => {
    const d = new OpcodeDispatch();
    expect(() => d.peek(0x65, () => {})).toThrow(
      "peek needs an owner; own the opcode instead",
    );
  });

  test("leaves has() to owners", () => {
    const d = new OpcodeDispatch();
    d.on(0x66, () => {});
    d.peek(0x66, () => {});
    expect(d.has(0x66)).toBe(true);
    expect(d.has(0x67)).toBe(false);
  });
});
