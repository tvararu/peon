import type { AreaOpcodes } from "#wow/areas/contract";

export const GUILDADMIN_OPCODES = {
  owns: [
    "CMSG_GUILD_CREATE",
    "SMSG_GUILD_DECLINE",
    "CMSG_GUILD_INFO",
    "SMSG_GUILD_INFO",
    "CMSG_GUILD_DISBAND",
    "MSG_SAVE_GUILD_EMBLEM",
    "MSG_TABARDVENDOR_ACTIVATE",
    "CMSG_GUILD_RANK",
    "CMSG_GUILD_ADD_RANK",
    "CMSG_GUILD_DEL_RANK",
    "CMSG_GUILD_SET_PUBLIC_NOTE",
    "CMSG_GUILD_SET_OFFICER_NOTE",
    "CMSG_GUILD_INFO_TEXT",
    "MSG_GUILD_PERMISSIONS",
    "MSG_GUILD_EVENT_LOG_QUERY",
  ],
  uses: ["SMSG_GUILD_EVENT"],
  stubs: [],
  dead: ["SMSG_GUILD_DECLINE"],
  unseen: ["CMSG_GUILD_CREATE"],
} as const satisfies AreaOpcodes;
