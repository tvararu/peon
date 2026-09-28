import type { AreaOpcodes } from "#wow/areas/contract";

export const BUYBACK_OPCODES = {
  owns: ["CMSG_BUYBACK_ITEM", "CMSG_BUY_ITEM_IN_SLOT"],
  uses: [
    "SMSG_BUY_FAILED",
    "SMSG_SELL_ITEM",
    "SMSG_BUY_ITEM",
    "SMSG_INVENTORY_CHANGE_FAILURE",
  ],
  stubs: [],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
