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

describe("parseMovementBlock vehicle trailer", () => {
  test("VEHICLE returns the id and orientation", () => {
    const w = new PacketWriter();
    w.uint16LE(UpdateFlag.HAS_POSITION | UpdateFlag.VEHICLE);
    w.floatLE(5);
    w.floatLE(6);
    w.floatLE(7);
    w.floatLE(1);
    w.uint32LE(315);
    w.floatLE(2.5);
    const r = new PacketReader(w.finish());
    const m = parseMovementBlock(r);
    expect(m.vehicle).toEqual({ id: 315, orientation: 2.5 });
    expect(r.remaining).toBe(0);
  });
});

const MOTION_TRANSPORT_FLAGS =
  UpdateFlag.TRANSPORT |
  UpdateFlag.HIGH_GUID |
  UpdateFlag.HAS_POSITION |
  UpdateFlag.ROTATION;

describe("parseMovementBlock transport trailer", () => {
  test("a motion transport block returns the path progress", () => {
    const w = new PacketWriter();
    w.uint16LE(MOTION_TRANSPORT_FLAGS);
    w.floatLE(1370);
    w.floatLE(-4370);
    w.floatLE(26);
    w.floatLE(3.2);
    w.uint32LE(0x1e_d0);
    w.uint32LE(123_456);
    w.uint64LE(0n);
    const r = new PacketReader(w.finish());
    const m = parseMovementBlock(r);
    expect(m.pathProgress).toBe(123_456);
    expect(must(m.point).x).toBeCloseTo(1370);
    expect(m.rotation).toMatchObject({ w: 1 });
    expect(r.remaining).toBe(0);
  });

  test("the path progress follows the attacking target guid", () => {
    const w = new PacketWriter();
    w.uint16LE(
      UpdateFlag.HAS_POSITION |
        UpdateFlag.HAS_ATTACKING_TARGET |
        UpdateFlag.TRANSPORT,
    );
    w.floatLE(1);
    w.floatLE(2);
    w.floatLE(3);
    w.floatLE(0);
    w.packedGuidBig(0xf1_30_00_00_00_00_00_07n);
    w.uint32LE(777);
    const r = new PacketReader(w.finish());
    expect(parseMovementBlock(r).pathProgress).toBe(777);
    expect(r.remaining).toBe(0);
  });

  test("a block without the transport flag has no path progress", () => {
    const w = new PacketWriter();
    w.uint16LE(UpdateFlag.HAS_POSITION);
    for (let i = 0; i < 4; i++) w.floatLE(0);
    const m = parseMovementBlock(new PacketReader(w.finish()));
    expect(m.pathProgress).toBeUndefined();
  });

  test("a POSITION block on a transport returns its guid and offset", () => {
    const guid = 0x1f_c0_00_00_00_00_00_14n;
    const w = new PacketWriter();
    w.uint16LE(UpdateFlag.POSITION);
    w.packedGuidBig(guid);
    w.floatLE(1400);
    w.floatLE(-4300);
    w.floatLE(30);
    w.floatLE(2);
    w.floatLE(-3);
    w.floatLE(4);
    w.floatLE(1.5);
    w.floatLE(0);
    const r = new PacketReader(w.finish());
    const m = parseMovementBlock(r);
    expect(m.transportGuid).toBe(guid);
    expect(m.transportOffset).toEqual({ x: 2, y: -3, z: 4 });
    expect(must(m.point).x).toBeCloseTo(1400);
    expect(r.remaining).toBe(0);
  });

  test("a POSITION block off a transport has no guid or offset", () => {
    const w = new PacketWriter();
    w.uint16LE(UpdateFlag.POSITION);
    w.rawBytes(new Uint8Array([0]));
    for (let i = 0; i < 8; i++) w.floatLE(i);
    const m = parseMovementBlock(new PacketReader(w.finish()));
    expect(m.transportGuid).toBeUndefined();
    expect(m.transportOffset).toBeUndefined();
  });
});
