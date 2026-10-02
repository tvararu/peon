import type { AreaOpcodes } from "#wow/areas/contract";

export const CHARTERS_OPCODES = {
  owns: [
    "CMSG_PETITION_SHOWLIST",
    "SMSG_PETITION_SHOWLIST",
    "CMSG_PETITION_BUY",
    "CMSG_PETITION_SHOW_SIGNATURES",
    "SMSG_PETITION_SHOW_SIGNATURES",
    "CMSG_PETITION_SIGN",
    "SMSG_PETITION_SIGN_RESULTS",
    "MSG_PETITION_DECLINE",
    "CMSG_OFFER_PETITION",
    "CMSG_TURN_IN_PETITION",
    "SMSG_TURN_IN_PETITION_RESULTS",
    "CMSG_PETITION_QUERY",
    "SMSG_PETITION_QUERY_RESPONSE",
    "MSG_PETITION_RENAME",
  ],
  uses: [],
  stubs: [],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
