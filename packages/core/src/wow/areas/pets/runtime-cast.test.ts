import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { petsPetSpellsBody } from "#test-support/areas/pets";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

const ME = 0x2an;
const TANK = 0xf1_50_00_62_f6_0c_89_41n;
const CANNON = 46_598;
const MACHINE_GUN = 46_599;
const VEHICLE_FLAGS = 0x8_00;

function vehicleBar(guid: bigint, spells: readonly number[]) {
  return petsPetSpellsBody({
    command: 0,
    cooldowns: [],
    duration: 0,
    family: 0,
    flags: VEHICLE_FLAGS,
    guid,
    react: 1,
    slots: [
      ...spells.map((action, index) => ({ action, type: index + 8 })),
      ...Array.from({ length: 10 - spells.length }, (_, index) => ({
        action: 0,
        type: spells.length + index + 8,
      })),
    ],
    spells: [],
  });
}

function rigWithVehicleBar(spells: readonly number[]) {
  const rig = areaRig("pets", { selfGuid: ME });
  rig.inject(GameOpcode.SMSG_PET_SPELLS, vehicleBar(TANK, spells));
  return rig;
}

describe("petCast on a vehicle bar", () => {
  test("casts a button 8-12 spell from the bar slots with the vehicle guid and no pet (PetHandler.cpp:1025-1034)", () => {
    const rig = rigWithVehicleBar([CANNON, MACHINE_GUN]);
    try {
      expect(rig.handle.act.petCast(MACHINE_GUN, { kind: "none" })).toEqual({
        castCount: 1,
        confirmed: false,
        ok: true,
      });
      expect(rig.sent).toHaveLength(1);
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.CMSG_PET_CAST_SPELL);
      const reader = new PacketReader(rig.sent[0]?.body ?? new Uint8Array());
      expect(reader.uint64LE()).toBe(TANK);
      expect(reader.uint8()).toBe(1);
      expect(reader.uint32LE()).toBe(MACHINE_GUN);
    } finally {
      rig.dispose();
    }
  });

  test("refuses a spell that is not on the vehicle bar and an empty slot before sending", () => {
    const rig = rigWithVehicleBar([CANNON]);
    try {
      expect(rig.handle.act.petCast(MACHINE_GUN, { kind: "none" })).toEqual({
        ok: false,
        reason: "not_known",
      });
      expect(rig.handle.act.petCast(0, { kind: "none" })).toEqual({
        ok: false,
        reason: "not_known",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a pet bar without the vehicle flag does not cast from its slots", () => {
    const rig = areaRig("pets", { selfGuid: ME });
    rig.inject(
      GameOpcode.SMSG_PET_SPELLS,
      petsPetSpellsBody({
        command: 0,
        cooldowns: [],
        duration: 0,
        family: 1,
        flags: 0,
        guid: TANK,
        react: 1,
        slots: [
          { action: CANNON, type: 8 },
          ...Array.from({ length: 9 }, () => ({ action: 0, type: 0 })),
        ],
        spells: [],
      }),
    );
    try {
      expect(rig.handle.act.petCast(CANNON, { kind: "none" })).toEqual({
        ok: false,
        reason: "not_known",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
