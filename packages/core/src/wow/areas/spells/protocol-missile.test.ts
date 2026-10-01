import { describe, expect, test } from "bun:test";
import { spellsProjectilePositionBody } from "#test-support/areas/spells";
import {
  buildMissileTrajectory,
  buildProjectilePosition,
  parseProjectilePosition,
} from "#wow/areas/spells/protocol";
import { PacketReader } from "#wow/protocol/packet";

const CASTER = 0x2an;

describe("missile and projectile wire", () => {
  test("buildProjectilePosition writes caster u64, spell u32, count u8 and three floats (SpellHandler.cpp:834-852)", () => {
    const body = buildProjectilePosition({
      castCount: 7,
      caster: CASTER,
      position: { x: 1.5, y: -2.5, z: 3.25 },
      spellId: 2120,
    });
    expect(body.length).toBe(8 + 4 + 1 + 12);
    const r = new PacketReader(body);
    expect(r.uint64LE()).toBe(CASTER);
    expect(r.uint32LE()).toBe(2120);
    expect(r.uint8()).toBe(7);
    expect([r.floatLE(), r.floatLE(), r.floatLE()]).toEqual([1.5, -2.5, 3.25]);
  });

  test("buildMissileTrajectory writes the reader's order and a zero moveStop that adds no tail (MiscHandler.cpp:1724-1766)", () => {
    const body = buildMissileTrajectory({
      caster: CASTER,
      current: { x: 1, y: 2, z: 3 },
      elevation: 0.5,
      spellId: 2120,
      speed: 20,
      target: { x: 4, y: 5, z: 6 },
    });
    expect(body.length).toBe(8 + 4 + 4 + 4 + 12 + 12 + 1);
    const r = new PacketReader(body);
    expect(r.uint64LE()).toBe(CASTER);
    expect(r.uint32LE()).toBe(2120);
    expect([r.floatLE(), r.floatLE()]).toEqual([0.5, 20]);
    expect([r.floatLE(), r.floatLE(), r.floatLE()]).toEqual([1, 2, 3]);
    expect([r.floatLE(), r.floatLE(), r.floatLE()]).toEqual([4, 5, 6]);
    expect(r.uint8()).toBe(0);
    expect(r.remaining).toBe(0);
  });

  test("parseProjectilePosition reads u64 caster, u8 count and three floats (SpellHandler.cpp:865-871)", () => {
    const body = spellsProjectilePositionBody({
      castCount: 3,
      caster: CASTER,
      x: -10.5,
      y: 20.25,
      z: 7,
    });
    expect(body.length).toBe(21);
    expect(parseProjectilePosition(new PacketReader(body))).toEqual({
      castCount: 3,
      caster: CASTER,
      x: -10.5,
      y: 20.25,
      z: 7,
    });
  });
});
