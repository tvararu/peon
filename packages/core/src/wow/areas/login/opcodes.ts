import type { AreaOpcodes } from "#wow/areas/contract";

export const LOGIN_OPCODES = {
  owns: [
    "SMSG_ADDON_INFO",
    "SMSG_CLIENTCACHE_VERSION",
    "SMSG_TUTORIAL_FLAGS",
    "SMSG_ACCOUNT_DATA_TIMES",
    "SMSG_FEATURE_SYSTEM_STATUS",
    "SMSG_LEARNED_DANCE_MOVES",
    "SMSG_PONG",
    "CMSG_KEEP_ALIVE",
    "SMSG_CHARACTER_LOGIN_FAILED",
    "CMSG_PLAYER_LOGOUT",
    "CMSG_LOGOUT_CANCEL",
    "SMSG_LOGOUT_CANCEL_ACK",
  ],
  uses: [],
  stubs: [],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
