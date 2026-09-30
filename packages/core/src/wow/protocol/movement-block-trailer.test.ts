import { describe, expect, test } from "bun:test";
import { must } from "#test-support/must";
import { UpdateFlag } from "./entity-fields";
import { parseMovementBlock } from "./movement-block";
import { PacketReader, PacketWriter } from "./packet";

describe("parseMovementBlock trailers", () => {
  test("trailing: HIGH_GUID", () => {
    const w = new PacketWriter();
    w.uint16LE(UpdateFlag.HAS_POSITION | UpdateFlag.HIGH_GUID);
    w.floatLE(5);
    w.floatLE(6);
    w.floatLE(7);
    w.floatLE(0);
    w.uint32LE(0);
    const r = new PacketReader(w.finish());
    const m = parseMovementBlock(r);
    expect(must(m.point).x).toBeCloseTo(5);
    expect(r.remaining).toBe(0);
  });

  test("trailing: LOW_GUID", () => {
    const w = new PacketWriter();
    w.uint16LE(UpdateFlag.HAS_POSITION | UpdateFlag.LOW_GUID);
    w.floatLE(5);
    w.floatLE(6);
    w.floatLE(7);
    w.floatLE(0);
    w.uint32LE(0);
    const r = new PacketReader(w.finish());
    const m = parseMovementBlock(r);
    expect(must(m.point).x).toBeCloseTo(5);
    expect(r.remaining).toBe(0);
  });

  test("trailing: HAS_ATTACKING_TARGET", () => {
    const w = new PacketWriter();
    w.uint16LE(UpdateFlag.HAS_POSITION | UpdateFlag.HAS_ATTACKING_TARGET);
    w.floatLE(5);
    w.floatLE(6);
    w.floatLE(7);
    w.floatLE(0);
    w.rawBytes(new Uint8Array([0]));
    const r = new PacketReader(w.finish());
    const m = parseMovementBlock(r);
    expect(must(m.point).x).toBeCloseTo(5);
    expect(r.remaining).toBe(0);
  });

  test("trailing: TRANSPORT", () => {
    const w = new PacketWriter();
    w.uint16LE(UpdateFlag.HAS_POSITION | UpdateFlag.TRANSPORT);
    w.floatLE(5);
    w.floatLE(6);
    w.floatLE(7);
    w.floatLE(0);
    w.uint32LE(0);
    const r = new PacketReader(w.finish());
    const m = parseMovementBlock(r);
    expect(must(m.point).x).toBeCloseTo(5);
    expect(r.remaining).toBe(0);
  });

  test("trailing: VEHICLE", () => {
    const w = new PacketWriter();
    w.uint16LE(UpdateFlag.HAS_POSITION | UpdateFlag.VEHICLE);
    w.floatLE(5);
    w.floatLE(6);
    w.floatLE(7);
    w.floatLE(0);
    w.uint32LE(0);
    w.floatLE(0);
    const r = new PacketReader(w.finish());
    const m = parseMovementBlock(r);
    expect(must(m.point).x).toBeCloseTo(5);
    expect(r.remaining).toBe(0);
  });

  test("trailing: ROTATION", () => {
    const w = new PacketWriter();
    w.uint16LE(UpdateFlag.HAS_POSITION | UpdateFlag.ROTATION);
    w.floatLE(5);
    w.floatLE(6);
    w.floatLE(7);
    w.floatLE(0);
    w.uint64LE(0n);
    const r = new PacketReader(w.finish());
    const m = parseMovementBlock(r);
    expect(must(m.point).x).toBeCloseTo(5);
    expect(m.rotation).toMatchObject({ w: 1, x: 0, y: 0, z: 0 });
    expect(r.remaining).toBe(0);
  });

  test("combined LIVING + trailing", () => {
    const w = new PacketWriter();
    const flags =
      UpdateFlag.LIVING | UpdateFlag.HAS_ATTACKING_TARGET | UpdateFlag.LOW_GUID;
    w.uint16LE(flags);
    w.uint32LE(0);
    w.uint16LE(0);
    w.uint32LE(0);
    w.floatLE(10);
    w.floatLE(20);
    w.floatLE(30);
    w.floatLE(0);
    w.floatLE(0);
    for (let i = 0; i < 9; i++) w.floatLE(0);
    w.uint32LE(0);
    w.rawBytes(new Uint8Array([0]));
    const r = new PacketReader(w.finish());
    const m = parseMovementBlock(r);
    expect(m.updateFlags).toBe(flags);
    expect(must(m.point).x).toBeCloseTo(10);
    expect(must(m.point).y).toBeCloseTo(20);
    expect(must(m.point).z).toBeCloseTo(30);
    expect(r.remaining).toBe(0);
  });
});
