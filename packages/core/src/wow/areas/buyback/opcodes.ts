import type { AreaOpcodes } from "#wow/areas/contract";

export const BUYBACK_OPCODES = {
  owns: ["CMSG_BUYBACK_ITEM", "CMSG_BUY_ITEM_IN_SLOT"],
  uses: [],
  stubs: [],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
