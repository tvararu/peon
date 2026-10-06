import { describe, expect, test } from "bun:test";
import { npcRoles } from "#wow/npc-roles";

describe("npcRoles", () => {
  test("maps AzerothCore NPC flag bits to roles in table order", () => {
    expect(npcRoles(0)).toEqual([]);
    expect(npcRoles(0x1 | 0x2)).toEqual(["gossip", "questgiver"]);
    expect(npcRoles(0x10_00 | 0x2_00 | 0x80)).toEqual([
      "vendor",
      "vendor_food",
      "repair",
    ]);
    expect(npcRoles(0x10 | 0x20)).toEqual(["trainer", "class_trainer"]);
    expect(npcRoles(0x1_00_00 | 0x4_00_00_00)).toEqual([
      "innkeeper",
      "mailbox",
    ]);
    expect(npcRoles(0x40_00)).toEqual(["spirit_healer"]);
  });

  test("ignores the unknown and vehicle bits", () => {
    expect(npcRoles(0x4 | 0x8 | 0x2_00_00_00)).toEqual([]);
  });

  test("names all 24 roles in table order when every role bit is set", () => {
    expect(npcRoles(0x5_ff_ff_f3)).toEqual([
      "gossip",
      "questgiver",
      "trainer",
      "class_trainer",
      "profession_trainer",
      "vendor",
      "vendor_ammo",
      "vendor_food",
      "vendor_poison",
      "vendor_reagent",
      "repair",
      "flight_master",
      "spirit_healer",
      "spirit_guide",
      "innkeeper",
      "banker",
      "petitioner",
      "tabard_designer",
      "battlemaster",
      "auctioneer",
      "stable_master",
      "guild_banker",
      "spellclick",
      "mailbox",
    ]);
  });
});
