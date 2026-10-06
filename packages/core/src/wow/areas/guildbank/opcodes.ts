import type { AreaOpcodes } from "#wow/areas/contract";

export const GUILDBANK_OPCODES = {
  owns: [
    "CMSG_GUILD_BANKER_ACTIVATE",
    "CMSG_GUILD_BANK_QUERY_TAB",
    "CMSG_GUILD_BANK_SWAP_ITEMS",
    "CMSG_GUILD_BANK_BUY_TAB",
    "CMSG_GUILD_BANK_UPDATE_TAB",
    "CMSG_GUILD_BANK_DEPOSIT_MONEY",
    "CMSG_GUILD_BANK_WITHDRAW_MONEY",
    "MSG_GUILD_BANK_LOG_QUERY",
    "MSG_GUILD_BANK_MONEY_WITHDRAWN",
    "MSG_QUERY_GUILD_BANK_TEXT",
    "CMSG_SET_GUILD_BANK_TEXT",
    "SMSG_GUILD_BANK_LIST",
  ],
  uses: ["SMSG_GUILD_COMMAND_RESULT", "SMSG_GUILD_EVENT"],
  stubs: [],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
