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
});
