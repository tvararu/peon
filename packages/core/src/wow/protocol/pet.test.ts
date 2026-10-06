import { describe, expect, test } from "bun:test";
import { PacketReader } from "#wow/protocol/packet";
import { buildPetAttack, PET_ATTACK_ACTION } from "#wow/protocol/pet";

describe("buildPetAttack", () => {
  test("packs COMMAND_ATTACK with ACT_COMMAND between two full guids", () => {
    expect(PET_ATTACK_ACTION).toBe(0x07_00_00_02);
    const bytes = buildPetAttack(
      0xf1_40_00_00_00_00_00_2an,
      0xf1_30_00_3d_23_01_7d_9dn,
    );
    const r = new PacketReader(bytes);
    expect(r.uint64LE()).toBe(0xf1_40_00_00_00_00_00_2an);
    expect(r.uint32LE()).toBe(0x07_00_00_02);
    expect(r.uint64LE()).toBe(0xf1_30_00_3d_23_01_7d_9dn);
    expect(r.remaining).toBe(0);
  });
});
