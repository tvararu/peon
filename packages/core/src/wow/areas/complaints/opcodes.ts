import type { AreaOpcodes } from "#wow/areas/contract";

export const COMPLAINTS_OPCODES = {
  owns: ["CMSG_COMPLAIN", "SMSG_COMPLAIN_RESULT"],
  uses: [],
  stubs: [],
  dead: [],
  unseen: ["CMSG_COMPLAIN", "SMSG_COMPLAIN_RESULT"],
} as const satisfies AreaOpcodes;
