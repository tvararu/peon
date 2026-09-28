import type { AreaOpcodes } from "#wow/areas/contract";

export const TIME_OPCODES = {
  owns: [
    "SMSG_LOGIN_SETTIMESPEED",
    "CMSG_QUERY_TIME",
    "SMSG_QUERY_TIME_RESPONSE",
  ],
  uses: [],
  stubs: [],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
