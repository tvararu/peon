import type { AreaOpcodes } from "#wow/areas/contract";

export const TRANSPORTS_OPCODES = {
  owns: ["CMSG_MOVE_CHNG_TRANSPORT"],
  uses: [],
  stubs: [],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
