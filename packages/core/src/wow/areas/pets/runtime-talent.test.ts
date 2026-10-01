import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { petsPetSpellsBody } from "#test-support/areas/pets";
import {
  buildLearnPreviewTalentsPet,
  buildPetLearnTalent,
} from "#wow/areas/pets/protocol";
import { GameOpcode } from "#wow/protocol/opcodes";

const PET = 0xf1_40_00_0c_a9_00_02_0bn;

const BAR = petsPetSpellsBody({
  command: 1,
  cooldowns: [],
  duration: 0,
  family: 31,
  flags: 0,
  guid: PET,
  react: 0,
  slots: [
    { action: 0, type: 0x07 },
    { action: 0, type: 0x07 },
    { action: 0, type: 0x07 },
    { action: 0, type: 0x07 },
    { action: 0, type: 0x07 },
    { action: 0, type: 0x07 },
    { action: 0, type: 0x07 },
    { action: 0, type: 0x07 },
    { action: 0, type: 0x07 },
    { action: 0, type: 0x07 },
  ],
  spells: [{ action: 17_253, type: 0xc1 }],
});

function rig(withBar: boolean) {
  const r = areaRig("pets", { selfGuid: 0x2an });
  if (withBar) r.inject(GameOpcode.SMSG_PET_SPELLS, BAR);
  return r;
}

const sent = (r: ReturnType<typeof rig>, opcode: number) =>
  r.sent.filter((row) => row.opcode === opcode);

const entries = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ rank: 0, talent: 100 + i }));

describe("pets talent runtime", () => {
  test("learnPetTalent with no bar is refused and sends nothing", () => {
    const r = rig(false);
    try {
      expect(r.handle.act.learnPetTalent(2214, 0)).toEqual({
        ok: false,
        reason: "no_pet",
      });
      expect(sent(r, GameOpcode.CMSG_PET_LEARN_TALENT)).toEqual([]);
    } finally {
      r.dispose();
    }
  });

  test("learnPetTalent sends the bar's pet, talent and rank", () => {
    const r = rig(true);
    try {
      expect(r.handle.act.learnPetTalent(2214, 1)).toEqual({ ok: true });
      expect(
        sent(r, GameOpcode.CMSG_PET_LEARN_TALENT).map((row) => [...row.body]),
      ).toEqual([[...buildPetLearnTalent(PET, 2214, 1)]]);
    } finally {
      r.dispose();
    }
  });

  test("learnPetTalents with no bar is refused and sends nothing", () => {
    const r = rig(false);
    try {
      expect(r.handle.act.learnPetTalents(entries(1))).toEqual({
        ok: false,
        reason: "no_pet",
      });
      expect(sent(r, GameOpcode.CMSG_LEARN_PREVIEW_TALENTS_PET)).toEqual([]);
    } finally {
      r.dispose();
    }
  });

  test("an empty list is refused and sends nothing", () => {
    const r = rig(true);
    try {
      expect(r.handle.act.learnPetTalents([])).toEqual({
        ok: false,
        reason: "empty_list",
      });
      expect(sent(r, GameOpcode.CMSG_LEARN_PREVIEW_TALENTS_PET)).toEqual([]);
    } finally {
      r.dispose();
    }
  });

  test("31 entries are refused, 30 are sent (PetHandler.cpp:1153-1155)", () => {
    const r = rig(true);
    try {
      expect(r.handle.act.learnPetTalents(entries(31))).toEqual({
        ok: false,
        reason: "too_many",
      });
      expect(sent(r, GameOpcode.CMSG_LEARN_PREVIEW_TALENTS_PET)).toEqual([]);
      expect(r.handle.act.learnPetTalents(entries(30))).toEqual({ ok: true });
      expect(
        sent(r, GameOpcode.CMSG_LEARN_PREVIEW_TALENTS_PET).map((row) => [
          ...row.body,
        ]),
      ).toEqual([[...buildLearnPreviewTalentsPet(PET, entries(30))]]);
    } finally {
      r.dispose();
    }
  });
});
