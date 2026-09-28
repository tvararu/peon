import { describe, expect, test } from "bun:test";
import { petsPetSpellsBody } from "#test-support/areas/pets";
import { PacketReader } from "#wow/protocol/packet";
import { parsePetSpells } from "#wow/protocol/pet-spells";

const PET = 0xf1_40_00_0c_9f_00_01_e6n;
const VEHICLE = 0xf1_50_00_6e_28_00_00_11n;
const COMMAND = 0x07;
const REACTION = 0x06;
const AUTOCAST = 0xc1;
const CASTABLE = 0x81;
const PASSIVE = 0x01;
const BITE = 17_253;
const GROWL = 2649;
const INFINITE = 0x80_00_00_00;

const PET_SLOTS = [
  { action: 2, type: COMMAND },
  { action: 1, type: COMMAND },
  { action: 0, type: COMMAND },
  { action: BITE, type: AUTOCAST },
  { action: GROWL, type: CASTABLE },
  { action: 0, type: PASSIVE },
  { action: 0, type: PASSIVE },
  { action: 2, type: REACTION },
  { action: 1, type: REACTION },
  { action: 0, type: REACTION },
];

function read(body: Uint8Array) {
  return parsePetSpells(new PacketReader(body));
}

describe("parsePetSpells", () => {
  test("reads the pet form Player::PetSpellInitialize writes (Player.cpp:9756-9826)", () => {
    const body = petsPetSpellsBody({
      command: 1,
      cooldowns: [
        { category: 0, categoryCooldown: 0, cooldown: 4500, spell: BITE },
        { category: 0, categoryCooldown: INFINITE, cooldown: 1, spell: GROWL },
      ],
      duration: 0,
      family: 1,
      flags: 0,
      guid: PET,
      react: 1,
      slots: PET_SLOTS,
      spells: [
        { action: BITE, type: AUTOCAST },
        { action: GROWL, type: CASTABLE },
      ],
    });
    expect(body.length).toBe(8 + 2 + 4 + 4 + 40 + 1 + 8 + 1 + 28);
    expect(read(body)).toEqual({
      command: 1,
      cooldowns: [
        {
          category: 0,
          categoryCooldownMs: 0,
          cooldownMs: 4500,
          infinite: false,
          spell: BITE,
        },
        {
          category: 0,
          categoryCooldownMs: INFINITE,
          cooldownMs: 1,
          infinite: true,
          spell: GROWL,
        },
      ],
      durationMs: 0,
      family: 1,
      flags: 0,
      guid: PET,
      react: 1,
      slots: PET_SLOTS,
      spells: [
        { action: BITE, type: AUTOCAST },
        { action: GROWL, type: CASTABLE },
      ],
    });
  });

  test("keeps the 0x800 flags and the empty slots of the vehicle form (Player.cpp:9856-9929)", () => {
    const slots = [
      { action: 62_286, type: 8 },
      { action: 0, type: 9 },
      { action: 0, type: 10 },
      { action: 0, type: 11 },
      { action: 0, type: 12 },
      { action: 0, type: 13 },
      { action: 0, type: 14 },
      { action: 0, type: 15 },
      { action: 0, type: 0 },
      { action: 0, type: 0 },
    ];
    const body = petsPetSpellsBody({
      command: 0,
      cooldowns: [],
      duration: 30_000,
      family: 0,
      flags: 0x8_00,
      guid: VEHICLE,
      react: 0,
      slots,
      spells: [],
    });
    expect([...body.subarray(22, 26)]).toEqual([0, 0, 0, 9]);
    expect(read(body)).toEqual({
      command: 0,
      cooldowns: [],
      durationMs: 30_000,
      family: 0,
      flags: 0x8_00,
      guid: VEHICLE,
      react: 0,
      slots,
      spells: [],
    });
  });

  test("reads the clear form as a zero guid only (Player.cpp:9384-9387, 9985-9990)", () => {
    const body = petsPetSpellsBody({ guid: 0n });
    expect(body.length).toBe(8);
    expect(read(body)).toEqual({ guid: 0n });
  });
});
