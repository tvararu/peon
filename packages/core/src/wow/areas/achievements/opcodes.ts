import type { AreaOpcodes } from "#wow/areas/contract";

export const ACHIEVEMENTS_OPCODES = {
  owns: [
    "SMSG_ALL_ACHIEVEMENT_DATA",
    "SMSG_CRITERIA_UPDATE",
    "SMSG_ACHIEVEMENT_EARNED",
    "SMSG_SERVER_FIRST_ACHIEVEMENT",
    "SMSG_CRITERIA_DELETED",
    "SMSG_ACHIEVEMENT_DELETED",
    "SMSG_TITLE_EARNED",
    "CMSG_SET_TITLE",
  ],
  uses: [],
  stubs: [],
  dead: [],
  unseen: ["SMSG_SERVER_FIRST_ACHIEVEMENT", "SMSG_ACHIEVEMENT_DELETED"],
} as const satisfies AreaOpcodes;
