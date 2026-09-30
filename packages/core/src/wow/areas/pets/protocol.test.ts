import { describe, expect, test } from "bun:test";
import {
  petsPetActionFeedbackBody,
  petsPetActionSoundBody,
  petsPetDismissSoundBody,
  petsPetLearnedSpellBody,
  petsPetUnlearnedSpellBody,
} from "#test-support/areas/pets";
import {
  buildPetAction,
  buildPetCancelAura,
  buildPetCastSpell,
  buildPetSetAction,
  buildPetSpellAutocast,
  buildPetStopAttack,
  buildRequestPetInfo,
  PET_ACTION,
  parsePetActionFeedback,
  parsePetActionSound,
  parsePetDismissSound,
  parsePetSpellId,
} from "#wow/areas/pets/protocol";
import { PacketReader } from "#wow/protocol/packet";
import { buildPetAttack } from "#wow/protocol/pet";

const PET = 0xf1_40_00_0c_a9_00_02_0bn;
const MOB = 0xf1_30_00_3e_8b_00_12_34n;

describe("pets protocol", () => {
  test("reads the spell id of SMSG_PET_LEARNED_SPELL (Pet.cpp:1911-1914)", () => {
    const body = petsPetLearnedSpellBody({ spell: 17_253 });
    expect([...body]).toEqual([0x65, 0x43, 0x00, 0x00]);
    expect(parsePetSpellId(new PacketReader(body))).toBe(17_253);
  });

  test("reads the spell id of SMSG_PET_UNLEARNED_SPELL (Pet.cpp:1965-1968)", () => {
    const body = petsPetUnlearnedSpellBody({ spell: 2649 });
    expect(parsePetSpellId(new PacketReader(body))).toBe(2649);
  });

  test("CMSG_REQUEST_PET_INFO has an empty body (MiscHandler.cpp:1560-1578)", () => {
    expect(buildRequestPetInfo()).toEqual(new Uint8Array());
  });

  test("CMSG_PET_ACTION writes pet, (type << 24) | action and target (PetHandler.cpp:57-65)", () => {
    const body = buildPetAction(PET, PET_ACTION.reaction, 2, 0n);
    expect([...body]).toEqual([
      0x0b, 0x02, 0x00, 0xa9, 0x0c, 0x00, 0x40, 0xf1, 0x02, 0x00, 0x00, 0x06, 0,
      0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  test("the command and reaction values follow Unit.h:565-578 and CharmInfo.h:61-65", () => {
    const action = (body: Uint8Array) =>
      new DataView(body.buffer, body.byteOffset).getUint32(8, true);
    expect(PET_ACTION).toEqual({ command: 0x07, reaction: 0x06 });
    expect(action(buildPetAction(PET, PET_ACTION.command, 0, 0n))).toBe(
      0x07_00_00_00,
    );
    expect(action(buildPetAction(PET, PET_ACTION.command, 3, 0n))).toBe(
      0x07_00_00_03,
    );
    expect(action(buildPetAction(PET, PET_ACTION.reaction, 0, 0n))).toBe(
      0x06_00_00_00,
    );
  });

  test("the attack command has the bytes of the legacy buildPetAttack", () => {
    expect(buildPetAction(PET, PET_ACTION.command, 2, MOB)).toEqual(
      buildPetAttack(PET, MOB),
    );
  });

  test("CMSG_PET_STOP_ATTACK is the pet guid (PetPackets.cpp:30-33)", () => {
    expect([...buildPetStopAttack(PET)]).toEqual([
      0x0b, 0x02, 0x00, 0xa9, 0x0c, 0x00, 0x40, 0xf1,
    ]);
  });

  test("SMSG_PET_ACTION_FEEDBACK names 1-3 and keeps any other value as unknown (PetDefines.h:71-77)", () => {
    const read = (code: number) =>
      parsePetActionFeedback(
        new PacketReader(petsPetActionFeedbackBody({ code })),
      );
    expect([1, 2, 3].map(read)).toEqual([
      "pet_dead",
      "nothing_to_attack",
      "cant_attack",
    ]);
    expect(read(0)).toBe("unknown");
    expect(read(4)).toBe("unknown");
  });

  test("SMSG_PET_ACTION_SOUND reads the unit guid and a signed action (PetPackets.cpp:54-59)", () => {
    const body = petsPetActionSoundBody({ action: 1, guid: PET });
    expect(body).toHaveLength(12);
    expect(parsePetActionSound(new PacketReader(body))).toEqual({
      action: 1,
      guid: PET,
    });
    expect(
      parsePetActionSound(
        new PacketReader(petsPetActionSoundBody({ action: -1, guid: PET })),
      ).action,
    ).toBe(-1);
  });

  test("SMSG_PET_DISMISS_SOUND reads the model id and position (PetPackets.cpp:61-68)", () => {
    const body = petsPetDismissSoundBody({
      modelId: 4449,
      x: 9459.5,
      y: -6832.25,
      z: 16.5,
    });
    expect(body).toHaveLength(16);
    expect(parsePetDismissSound(new PacketReader(body))).toEqual({
      modelId: 4449,
      x: 9459.5,
      y: -6832.25,
      z: 16.5,
    });
  });

  test("CMSG_PET_CAST_SPELL writes guid, count, spell, flags and the target block (PetHandler.cpp:1018-1023)", () => {
    const unit = buildPetCastSpell(PET, 1, 2649, { kind: "unit", guid: MOB });
    expect([...unit.slice(0, 15)]).toEqual([
      0x0b, 0x02, 0x00, 0xa9, 0x0c, 0x00, 0x40, 0xf1, 1, 0x59, 0x0a, 0x00, 0x00,
      0, 0x02,
    ]);
    const r = new PacketReader(unit);
    expect(r.uint64LE()).toBe(PET);
    expect(r.uint8()).toBe(1);
    expect(r.uint32LE()).toBe(2649);
    expect(r.uint8()).toBe(0);
    expect(r.uint32LE()).toBe(2);
    expect(r.packedGuidBig()).toBe(MOB);
  });

  test("CMSG_PET_CAST_SPELL with no target writes an empty mask (PetHandler.cpp:1018-1023)", () => {
    const body = buildPetCastSpell(PET, 2, 2649, { kind: "none" });
    const r = new PacketReader(body);
    expect(r.uint64LE()).toBe(PET);
    expect(r.uint8()).toBe(2);
    expect(r.uint32LE()).toBe(2649);
    expect(r.uint8()).toBe(0);
    expect(r.uint32LE()).toBe(0);
    expect(r.remaining).toBe(0);
  });

  test("CMSG_PET_SPELL_AUTOCAST writes guid, spell and the flag (PetPackets.cpp:35-40)", () => {
    const off = buildPetSpellAutocast(PET, 2649, false);
    const r = new PacketReader(off);
    expect(r.uint64LE()).toBe(PET);
    expect(r.uint32LE()).toBe(2649);
    expect(r.uint8()).toBe(0);
    const on = buildPetSpellAutocast(PET, 2649, true);
    expect([...on.slice(0, 12)]).toEqual([...off.slice(0, 12)]);
    expect(on[12]).toBe(1);
  });

  test("CMSG_PET_SET_ACTION writes guid and one or two slot pairs (PetHandler.cpp:696-716)", () => {
    const single = buildPetSetAction(PET, [{ slot: 3, packed: 0xc1_00_43_65 }]);
    const r = new PacketReader(single);
    expect(r.uint64LE()).toBe(PET);
    expect(r.uint32LE()).toBe(3);
    expect(r.uint32LE()).toBe(0xc1_00_43_65);
    const both = buildPetSetAction(PET, [
      { slot: 3, packed: 0xc1_00_43_65 },
      { slot: 4, packed: 0x07_00_00_02 },
    ]);
    expect(both).toHaveLength(24);
    const b = new PacketReader(both);
    expect(b.uint64LE()).toBe(PET);
    expect(b.uint32LE()).toBe(3);
    expect(b.uint32LE()).toBe(0xc1_00_43_65);
    expect(b.uint32LE()).toBe(4);
    expect(b.uint32LE()).toBe(0x07_00_00_02);
  });

  test("CMSG_PET_CANCEL_AURA writes guid and spell (SpellHandler.cpp:604-608)", () => {
    const body = buildPetCancelAura(PET, 2649);
    const r = new PacketReader(body);
    expect(r.uint64LE()).toBe(PET);
    expect(r.uint32LE()).toBe(2649);
  });
});
