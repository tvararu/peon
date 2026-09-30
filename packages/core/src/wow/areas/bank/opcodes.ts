import type { AreaOpcodes } from "#wow/areas/contract";

export const BANK_OPCODES = {
  owns: [
    "CMSG_BANKER_ACTIVATE",
    "CMSG_AUTOBANK_ITEM",
    "CMSG_AUTOSTORE_BANK_ITEM",
    "CMSG_BUY_BANK_SLOT",
    "SMSG_BUY_BANK_SLOT_RESULT",
  ],
  uses: [],
  stubs: [],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
