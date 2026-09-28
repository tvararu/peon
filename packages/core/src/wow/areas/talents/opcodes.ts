import type { AreaOpcodes } from "#wow/areas/contract";

export const TALENTS_OPCODES = {
  owns: [
    "SMSG_TALENTS_INFO",
    "CMSG_LEARN_TALENT",
    "CMSG_LEARN_PREVIEW_TALENTS",
    "MSG_TALENT_WIPE_CONFIRM",
    "CMSG_REMOVE_GLYPH",
    "CMSG_UNLEARN_TALENTS",
    "SMSG_TALENTS_INVOLUNTARILY_RESET",
  ],
  uses: [],
  stubs: [["SMSG_TALENTS_INFO", "Talents"]],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
