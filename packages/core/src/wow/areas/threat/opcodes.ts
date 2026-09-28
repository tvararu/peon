import type { AreaOpcodes } from "#wow/areas/contract";

export const THREAT_OPCODES = {
  owns: [
    "SMSG_HIGHEST_THREAT_UPDATE",
    "SMSG_THREAT_UPDATE",
    "SMSG_THREAT_REMOVE",
    "SMSG_THREAT_CLEAR",
    "SMSG_AI_REACTION",
    "SMSG_BREAK_TARGET",
    "SMSG_CLEAR_TARGET",
  ],
  uses: [],
  stubs: [],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
