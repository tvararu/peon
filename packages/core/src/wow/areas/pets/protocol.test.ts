import { describe, expect, test } from "bun:test";
import {
  petsPetLearnedSpellBody,
  petsPetUnlearnedSpellBody,
} from "#test-support/areas/pets";
import { buildRequestPetInfo, parsePetSpellId } from "#wow/areas/pets/protocol";
import { PacketReader } from "#wow/protocol/packet";

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
});
