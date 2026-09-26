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

export function npcRoles(_flags: number): NpcRole[] {
  throw new Error("not_implemented");
}
