import { describe, expect, test } from "bun:test";
import { PacketWriter } from "#wow/protocol/packet";
import {
  type SpellTarget,
  writeSpellTargets,
} from "#wow/protocol/spell-targets";

const CHEST = 0xf1_10_2c_14_00_00_52_80n;

function bytes(target: SpellTarget): number[] {
  const w = new PacketWriter();
  writeSpellTargets(w, target);
  return [...w.finish()];
}

describe("writeSpellTargets (SpellCastTargets::Read, Spells/Spell.cpp:163-200)", () => {
  test("no target writes a zero mask and nothing else", () => {
    expect(bytes({ kind: "none" })).toEqual([0, 0, 0, 0]);
  });

  test("a unit writes the unit mask and a packed guid", () => {
    expect(bytes({ kind: "unit", guid: 0x64n })).toEqual([
      0x02, 0, 0, 0, 0x01, 0x64,
    ]);
  });

  test("an object writes the game object mask and a packed guid", () => {
    expect(bytes({ kind: "object", guid: CHEST })).toEqual([
      0x00, 0x08, 0, 0, 0xf3, 0x80, 0x52, 0x14, 0x2c, 0x10, 0xf1,
    ]);
  });

  test("an item writes the item mask and a packed guid", () => {
    expect(bytes({ kind: "item", guid: 0x4000_0000_000f_17a9n })).toEqual([
      0x10, 0, 0, 0, 0x87, 0xa9, 0x17, 0x0f, 0x40,
    ]);
  });

  test("a destination writes the dest mask, a zero transport and three floats", () => {
    expect(bytes({ kind: "dest", x: 1, y: -2, z: 0.5 })).toEqual([
      0x40, 0, 0, 0, 0x00, 0, 0, 0x80, 0x3f, 0, 0, 0, 0xc0, 0, 0, 0, 0x3f,
    ]);
  });
});
