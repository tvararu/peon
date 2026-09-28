import type { AreaOpcodes } from "#wow/areas/contract";

export const TIME_OPCODES = {
  owns: [
    "SMSG_LOGIN_SETTIMESPEED",
    "CMSG_QUERY_TIME",
    "SMSG_QUERY_TIME_RESPONSE",
    "CMSG_WORLD_STATE_UI_TIMER_UPDATE",
    "SMSG_WORLD_STATE_UI_TIMER_UPDATE",
  ],
  uses: [],
  stubs: [],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
