import type { AreaOpcodes } from "#wow/areas/contract";

export const INSPECT_OPCODES = {
  owns: [
    "CMSG_INSPECT",
    "SMSG_INSPECT_TALENT",
    "CMSG_QUERY_INSPECT_ACHIEVEMENTS",
    "SMSG_RESPOND_INSPECT_ACHIEVEMENTS",
  ],
  uses: [],
  stubs: [],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
