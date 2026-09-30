import { describe, expect, test } from "bun:test";
import { must } from "#test-support/must";
import { UpdateFlag } from "./entity-fields";
import { parseMovementBlock, unpackRotation } from "./movement-block";
import { PacketReader, PacketWriter } from "./packet";

describe("packed object rotation (GameObject.cpp:2243-2254)", () => {
  test("zero packed rotation is the identity", () => {
    expect(unpackRotation(0n)).toMatchObject({ w: 1, x: 0, y: 0, z: 0 });
  });

  test("the trailer unpacks the shrine spawn quaternion", () => {
    const w = new PacketWriter();
    w.uint16LE(UpdateFlag.HAS_POSITION | UpdateFlag.ROTATION);
    w.floatLE(5);
    w.floatLE(6);
    w.floatLE(7);
    w.floatLE(0);
    w.uint64LE(514395574543411482n);
    const m = parseMovementBlock(new PacketReader(w.finish()));
    expect(must(m.point).x).toBeCloseTo(5);
    expect(m.rotation?.x).toBeCloseTo(0.0558, 3);
    expect(m.rotation?.y).toBeCloseTo(0.0248, 3);
    expect(m.rotation?.z).toBeCloseTo(-0.9118, 3);
    expect(m.rotation?.w).toBeCloseTo(0.406, 3);
  });
});
