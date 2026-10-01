import type { AreaOpcodes } from "#wow/areas/contract";

export const TRANSPORTS_OPCODES = {
  owns: ["CMSG_MOVE_CHNG_TRANSPORT"],
  uses: [
    "SMSG_UPDATE_OBJECT",
    "SMSG_COMPRESSED_UPDATE_OBJECT",
    "SMSG_DESTROY_OBJECT",
    "SMSG_GAMEOBJECT_QUERY_RESPONSE",
  ],
  stubs: [],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
