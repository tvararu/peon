import type { AreaOpcodes } from "#wow/areas/contract";

export const LOOTING_OPCODES = {
  owns: [
    "SMSG_LOOT_LIST",
    "CMSG_OPT_OUT_OF_LOOT",
    "CMSG_LOOT_METHOD",
    "SMSG_LOOT_MASTER_LIST",
    "CMSG_LOOT_MASTER_GIVE",
    "SMSG_LOOT_ITEM_NOTIFY",
  ],
  uses: [],
  stubs: [],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
