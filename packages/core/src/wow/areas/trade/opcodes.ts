import type { AreaOpcodes } from "#wow/areas/contract";

export const TRADE_OPCODES = {
  owns: [
    "SMSG_TRADE_STATUS",
    "CMSG_INITIATE_TRADE",
    "CMSG_BEGIN_TRADE",
    "CMSG_BUSY_TRADE",
    "CMSG_IGNORE_TRADE",
    "CMSG_CANCEL_TRADE",
    "SMSG_TRADE_STATUS_EXTENDED",
    "CMSG_SET_TRADE_ITEM",
    "CMSG_CLEAR_TRADE_ITEM",
    "CMSG_SET_TRADE_GOLD",
    "CMSG_ACCEPT_TRADE",
    "CMSG_UNACCEPT_TRADE",
  ],
  uses: [],
  stubs: [
    ["SMSG_TRADE_STATUS", "Trade window"],
    ["SMSG_TRADE_STATUS_EXTENDED", "Trade update"],
  ],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
