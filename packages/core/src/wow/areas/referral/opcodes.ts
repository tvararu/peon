import type { AreaOpcodes } from "#wow/areas/contract";

export const REFERRAL_OPCODES = {
  owns: [
    "CMSG_GRANT_LEVEL",
    "SMSG_PROPOSE_LEVEL_GRANT",
    "CMSG_ACCEPT_LEVEL_GRANT",
    "SMSG_REFER_A_FRIEND_FAILURE",
  ],
  uses: [],
  stubs: [],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
