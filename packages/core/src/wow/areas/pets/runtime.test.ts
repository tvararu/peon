import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { petsPetSpellsBody } from "#test-support/areas/pets";
import { buildPetAction, PET_ACTION } from "#wow/areas/pets/protocol";
import type { Entity } from "#wow/entity-store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

const ME = 0x2an;
const PET = 0xf1_40_00_0c_a9_00_02_0bn;
const BITE = 17_253;
const GROWL = 2649;
const DASH = 23_099;
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
    { action: BITE, type: 0xc1 },
    { action: GROWL, type: 0x81 },
    { action: DASH, type: 0x01 },
    { action: 0, type: 0x01 },
    { action: 2, type: 0x06 },
    { action: 1, type: 0x06 },
    { action: 0, type: 0x06 },
  ],
  spells: [
    { action: BITE, type: 0xc1 },
    { action: GROWL, type: 0x81 },
    { action: DASH, type: 0x01 },
  ],
});
const REQUEST = {
  body: new Uint8Array(),
  opcode: GameOpcode.CMSG_REQUEST_PET_INFO,
};

function action(type: number, value: number) {
  return {
    body: buildPetAction(PET, type, value, 0n),
    opcode: GameOpcode.CMSG_PET_ACTION,
  };
}

function withBar() {
  const rig = areaRig("pets", { selfGuid: ME });
  rig.inject(GameOpcode.SMSG_PET_SPELLS, BAR);
  return rig;
}

function withPet(bytes2: number, health = 410) {
  const owner = {
    guid: ME,
    rawFields: new Map([
      [UNIT_FIELDS.SUMMON.offset, 0xa9_00_02_0b],
      [UNIT_FIELDS.SUMMON.offset + 1, 0xf1_40_00_0c],
    ]),
  } as unknown as Entity;
  const pet = {
    guid: PET,
    rawFields: new Map<number, number>([
      [UNIT_FIELDS.BYTES_2.offset, bytes2],
      [UNIT_FIELDS.HEALTH.offset, health],
    ]),
  } as unknown as Entity;
  const rig = areaRig("pets", {
    getEntity: (guid) => [owner, pet].find((row) => row.guid === guid),
    selfGuid: ME,
  });
  rig.inject(GameOpcode.SMSG_PET_SPELLS, BAR);
  return { act: rig.handle.act, dispose: rig.dispose, sent: rig.sent };
}

describe("pets runtime", () => {
  test("requestPetInfo sends one empty CMSG_REQUEST_PET_INFO", () => {
    const rig = areaRig("pets");
    try {
      expect(rig.handle.act.requestPetInfo()).toEqual({ ok: true });
      expect(rig.sent).toEqual([REQUEST]);
    } finally {
      rig.dispose();
    }
  });

  test("follow and stay send CMSG_PET_ACTION then ask for the bar again (MiscHandler.cpp:1567-1568)", () => {
    const rig = withBar();
    try {
      expect(rig.handle.act.petCommand("follow")).toEqual({ ok: true });
      expect(rig.handle.act.petCommand("stay")).toEqual({ ok: true });
      expect(rig.sent).toEqual([
        action(PET_ACTION.command, 1),
        REQUEST,
        action(PET_ACTION.command, 0),
        REQUEST,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("each stance sends its reaction then asks for the bar again", () => {
    const rig = withBar();
    try {
      expect(rig.handle.act.petStance("passive")).toEqual({ ok: true });
      expect(rig.handle.act.petStance("defensive")).toEqual({ ok: true });
      expect(rig.handle.act.petStance("aggressive")).toEqual({ ok: true });
      expect(rig.sent).toEqual([
        action(PET_ACTION.reaction, 0),
        REQUEST,
        action(PET_ACTION.reaction, 1),
        REQUEST,
        action(PET_ACTION.reaction, 2),
        REQUEST,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("petStopAttack sends one CMSG_PET_STOP_ATTACK with the pet guid", () => {
    const rig = withBar();
    try {
      expect(rig.handle.act.petStopAttack()).toEqual({ ok: true });
      expect(rig.sent).toHaveLength(1);
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.CMSG_PET_STOP_ATTACK);
      expect(
        new PacketReader(rig.sent[0]?.body ?? new Uint8Array()).uint64LE(),
      ).toBe(PET);
    } finally {
      rig.dispose();
    }
  });

  test("with no bar every act refuses no_pet and sends nothing", () => {
    const rig = areaRig("pets", { selfGuid: ME });
    try {
      const refused = { ok: false, reason: "no_pet" } as const;
      expect(rig.handle.act.petCommand("follow")).toEqual(refused);
      expect(rig.handle.act.petCommand("stay")).toEqual(refused);
      expect(rig.handle.act.petCommand("dismiss")).toEqual(refused);
      expect(rig.handle.act.petStance("aggressive")).toEqual(refused);
      expect(rig.handle.act.petStopAttack()).toEqual(refused);
      expect(rig.handle.act.petCast(GROWL, { kind: "none" })).toEqual(refused);
      expect(rig.handle.act.petAutocast(GROWL, false)).toEqual(refused);
      expect(rig.handle.act.petSetAction(3, GROWL, 0xc1)).toEqual(refused);
      expect(rig.handle.act.petSwapActions(3, 4)).toEqual(refused);
      expect(rig.handle.act.petCancelAura(GROWL)).toEqual(refused);
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("dismiss with a bar but no pet entity in view refuses no_pet and sends nothing", () => {
    const rig = withBar();
    try {
      expect(rig.handle.act.petCommand("dismiss")).toEqual({
        ok: false,
        reason: "no_pet",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("dismiss refuses a hunter pet, because command 3 deletes it (PetHandler.cpp:287-288)", () => {
    const rig = withPet(0x00_02_00_00);
    try {
      expect(rig.act.petCommand("dismiss")).toEqual({
        ok: false,
        reason: "hunter_pet_dismiss",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("dismiss sends command 3 for a pet that cannot be abandoned", () => {
    const rig = withPet(0);
    try {
      expect(rig.act.petCommand("dismiss")).toEqual({ ok: true });
      expect(rig.sent).toEqual([action(PET_ACTION.command, 3)]);
    } finally {
      rig.dispose();
    }
  });

  test("petCast refuses an unknown spell and a dead pet before sending (PetHandler.cpp:1041-1044)", () => {
    const bar = withBar();
    try {
      expect(bar.handle.act.petCast(999_999, { kind: "none" })).toEqual({
        ok: false,
        reason: "not_known",
      });
      expect(bar.sent).toEqual([]);
    } finally {
      bar.dispose();
    }
    const dead = withPet(0, 0);
    try {
      expect(dead.act.petCast(GROWL, { kind: "none" })).toEqual({
        ok: false,
        reason: "dead",
      });
      expect(dead.sent).toEqual([]);
    } finally {
      dead.dispose();
    }
  });

  test("petCast sends CMSG_PET_CAST_SPELL with the pet guid and a rising count (PetHandler.cpp:1018-1023)", () => {
    const rig = withPet(0);
    try {
      expect(rig.act.petCast(GROWL, { kind: "none" })).toEqual({
        castCount: 1,
        ok: true,
      });
      expect(rig.act.petCast(GROWL, { kind: "none" })).toEqual({
        castCount: 2,
        ok: true,
      });
      expect(rig.sent).toHaveLength(2);
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.CMSG_PET_CAST_SPELL);
      const first = new PacketReader(rig.sent[0]?.body ?? new Uint8Array());
      expect(first.uint64LE()).toBe(PET);
      expect(first.uint8()).toBe(1);
      expect(first.uint32LE()).toBe(GROWL);
      const second = new PacketReader(rig.sent[1]?.body ?? new Uint8Array());
      second.uint64LE();
      expect(second.uint8()).toBe(2);
    } finally {
      rig.dispose();
    }
  });

  test("petAutocast sends CMSG_PET_SPELL_AUTOCAST then asks for the bar again (PetHandler.cpp:955-1010)", () => {
    const rig = withPet(0);
    try {
      expect(rig.act.petAutocast(GROWL, false)).toEqual({ ok: true });
      expect(rig.sent).toHaveLength(2);
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.CMSG_PET_SPELL_AUTOCAST);
      const r = new PacketReader(rig.sent[0]?.body ?? new Uint8Array());
      expect(r.uint64LE()).toBe(PET);
      expect(r.uint32LE()).toBe(GROWL);
      expect(r.uint8()).toBe(0);
      expect(rig.sent[1]).toEqual(REQUEST);
    } finally {
      rig.dispose();
    }
  });

  test("petAutocast refuses an unknown spell and a passive spell (PetHandler.cpp:987-988)", () => {
    const rig = withPet(0);
    try {
      expect(rig.act.petAutocast(999_999, true)).toEqual({
        ok: false,
        reason: "not_known",
      });
      expect(rig.act.petAutocast(DASH, true)).toEqual({
        ok: false,
        reason: "not_autocastable",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("petSetAction refuses a slot outside 0-9 and petSwapActions sends one packet with two pairs (PetHandler.cpp:716-727)", () => {
    const rig = withPet(0);
    try {
      expect(rig.act.petSetAction(10, GROWL, 0xc1)).toEqual({
        ok: false,
        reason: "bad_slot",
      });
      expect(rig.act.petSwapActions(3, 10)).toEqual({
        ok: false,
        reason: "bad_slot",
      });
      expect(rig.sent).toEqual([]);
      expect(rig.act.petSwapActions(3, 4)).toEqual({ ok: true });
      expect(rig.sent).toHaveLength(1);
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.CMSG_PET_SET_ACTION);
      const r = new PacketReader(rig.sent[0]?.body ?? new Uint8Array());
      expect(r.uint64LE()).toBe(PET);
      expect(r.uint32LE()).toBe(3);
      expect(r.uint32LE()).toBe(0x81_00_0a_59);
      expect(r.uint32LE()).toBe(4);
      expect(r.uint32LE()).toBe(0xc1_00_43_65);
    } finally {
      rig.dispose();
    }
  });

  test("petCancelAura sends one CMSG_PET_CANCEL_AURA with the pet guid (SpellHandler.cpp:604-608)", () => {
    const rig = withPet(0);
    try {
      expect(rig.act.petCancelAura(GROWL)).toEqual({ ok: true });
      expect(rig.sent).toHaveLength(1);
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.CMSG_PET_CANCEL_AURA);
      const r = new PacketReader(rig.sent[0]?.body ?? new Uint8Array());
      expect(r.uint64LE()).toBe(PET);
      expect(r.uint32LE()).toBe(GROWL);
    } finally {
      rig.dispose();
    }
  });
});
