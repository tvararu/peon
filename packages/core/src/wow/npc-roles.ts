export type NpcRole =
  | "gossip"
  | "questgiver"
  | "trainer"
  | "class_trainer"
  | "profession_trainer"
  | "vendor"
  | "vendor_ammo"
  | "vendor_food"
  | "vendor_poison"
  | "vendor_reagent"
  | "repair"
  | "flight_master"
  | "spirit_healer"
  | "spirit_guide"
  | "innkeeper"
  | "banker"
  | "petitioner"
  | "tabard_designer"
  | "battlemaster"
  | "auctioneer"
  | "stable_master"
  | "guild_banker"
  | "spellclick"
  | "mailbox";

const NPC_FLAGS: [flag: number, role: NpcRole][] = [
  [0x1, "gossip"],
  [0x2, "questgiver"],
  [0x10, "trainer"],
  [0x20, "class_trainer"],
  [0x40, "profession_trainer"],
  [0x80, "vendor"],
  [0x1_00, "vendor_ammo"],
  [0x2_00, "vendor_food"],
  [0x4_00, "vendor_poison"],
  [0x8_00, "vendor_reagent"],
  [0x10_00, "repair"],
  [0x20_00, "flight_master"],
  [0x40_00, "spirit_healer"],
  [0x80_00, "spirit_guide"],
  [0x1_00_00, "innkeeper"],
  [0x2_00_00, "banker"],
  [0x4_00_00, "petitioner"],
  [0x8_00_00, "tabard_designer"],
  [0x10_00_00, "battlemaster"],
  [0x20_00_00, "auctioneer"],
  [0x40_00_00, "stable_master"],
  [0x80_00_00, "guild_banker"],
  [0x1_00_00_00, "spellclick"],
  [0x4_00_00_00, "mailbox"],
];

export function npcRoles(flags: number): NpcRole[] {
  return NPC_FLAGS.filter(([flag]) => (flags & flag) !== 0).map(
    ([, role]) => role,
  );
}
