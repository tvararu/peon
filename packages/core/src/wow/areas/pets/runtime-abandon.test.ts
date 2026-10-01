import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { petsPetSpellsBody } from "#test-support/areas/pets";
import { buildDismissCritter, buildPetAbandon } from "#wow/areas/pets/protocol";
import type { Entity } from "#wow/entity-store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

const ME = 0x2an;
const PET = 0xf1_40_00_0c_a9_00_02_0bn;
const CRITTER = 0xf1_30_00_0c_a9_00_02_0cn;

const BAR = petsPetSpellsBody({
  command: 1,
  cooldowns: [],
  duration: 0,
  family: 31,
  flags: 0,
  guid: PET,
  react: 0,
  slots: [
    { action: 2, type: 0x07 },
    { action: 1, type: 0x07 },
    { action: 0, type: 0x07 },
    { action: 17_253, type: 0xc1 },
    { action: 2649, type: 0x81 },
    { action: 23_099, type: 0x01 },
    { action: 0, type: 0x01 },
    { action: 2, type: 0x06 },
    { action: 1, type: 0x06 },
    { action: 0, type: 0x06 },
  ],
  spells: [
    { action: 17_253, type: 0xc1 },
    { action: 2649, type: 0x81 },
    { action: 23_099, type: 0x01 },
  ],
});

function rig(critter: bigint) {
  const owner = {
    guid: ME,
    rawFields: new Map<number, number>([
      [UNIT_FIELDS.CRITTER.offset, Number(critter & 0xff_ff_ff_ffn)],
      [UNIT_FIELDS.CRITTER.offset + 1, Number(critter >> 32n)],
      [UNIT_FIELDS.SUMMON.offset, 0xa9_00_02_0b],
      [UNIT_FIELDS.SUMMON.offset + 1, 0xf1_40_00_0c],
    ]),
  } as unknown as Entity;
  const pet = {
    guid: PET,
    rawFields: new Map([
      [UNIT_FIELDS.BYTES_2.offset, 0x02_00_00],
      [UNIT_FIELDS.PETNUMBER.offset, 42],
      [UNIT_FIELDS.HEALTH.offset, 410],
      [UNIT_FIELDS.MAXHEALTH.offset, 410],
    ]),
  } as unknown as Entity;
  const r = areaRig("pets", {
    getEntity: (guid) => [owner, pet].find((row) => row.guid === guid),
    selfGuid: ME,
  });
  return { owner, r };
}

const sentOf = (r: ReturnType<typeof rig>["r"], opcode: number) =>
  r.sent.filter((row) => row.opcode === opcode);

describe("pets abandon runtime", () => {
  test("abandon with no bar is refused and sends nothing", () => {
    const { r } = rig(0n);
    try {
      expect(r.handle.act.abandonPet()).toEqual({
        ok: false,
        reason: "no_pet",
      });
      expect(sentOf(r, GameOpcode.CMSG_PET_ABANDON)).toEqual([]);
    } finally {
      r.dispose();
    }
  });

  test("abandon with a bar sends the bar's guid (PetHandler.cpp:931-949)", () => {
    const { r } = rig(0n);
    try {
      r.inject(GameOpcode.SMSG_PET_SPELLS, BAR);
      expect(r.handle.act.abandonPet()).toEqual({ ok: true });
      const rows = sentOf(r, GameOpcode.CMSG_PET_ABANDON);
      expect(rows.map((row) => [...row.body])).toEqual([
        [...buildPetAbandon(PET)],
      ]);
    } finally {
      r.dispose();
    }
  });
});

describe("pets dismiss critter runtime", () => {
  test("no critter on the owner is refused and sends nothing", () => {
    const { r } = rig(0n);
    try {
      expect(r.handle.act.dismissCritter()).toEqual({
        ok: false,
        reason: "no_critter",
      });
      expect(sentOf(r, GameOpcode.CMSG_DISMISS_CRITTER)).toEqual([]);
    } finally {
      r.dispose();
    }
  });

  test("a critter guid in the owner's fields is sent (PetPackets.cpp:20-23)", () => {
    const { r } = rig(CRITTER);
    try {
      expect(r.handle.act.dismissCritter()).toEqual({ ok: true });
      const rows = sentOf(r, GameOpcode.CMSG_DISMISS_CRITTER);
      expect(rows.map((row) => [...row.body])).toEqual([
        [...buildDismissCritter(CRITTER)],
      ]);
    } finally {
      r.dispose();
    }
  });

  test("the guid is read at call time, not at construction", () => {
    const { owner, r } = rig(CRITTER);
    try {
      (owner.rawFields as Map<number, number>).set(
        UNIT_FIELDS.CRITTER.offset,
        0,
      );
      (owner.rawFields as Map<number, number>).set(
        UNIT_FIELDS.CRITTER.offset + 1,
        0,
      );
      expect(r.handle.act.dismissCritter()).toEqual({
        ok: false,
        reason: "no_critter",
      });
    } finally {
      r.dispose();
    }
  });
});
