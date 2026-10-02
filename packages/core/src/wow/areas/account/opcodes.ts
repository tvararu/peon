import type { AreaOpcodes } from "#wow/areas/contract";

export const ACCOUNT_OPCODES = {
  owns: [
    "CMSG_READY_FOR_ACCOUNT_DATA_TIMES",
    "CMSG_REQUEST_ACCOUNT_DATA",
    "SMSG_UPDATE_ACCOUNT_DATA",
    "CMSG_UPDATE_ACCOUNT_DATA",
    "SMSG_UPDATE_ACCOUNT_DATA_COMPLETE",
    "CMSG_TUTORIAL_FLAG",
    "CMSG_TUTORIAL_CLEAR",
    "CMSG_TUTORIAL_RESET",
  ],
  uses: [],
  stubs: [],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
