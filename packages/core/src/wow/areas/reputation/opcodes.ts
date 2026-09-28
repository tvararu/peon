import type { AreaOpcodes } from "#wow/areas/contract";

export const REPUTATION_OPCODES = {
  owns: [
    "SMSG_INITIALIZE_FACTIONS",
    "SMSG_SET_FACTION_STANDING",
    "SMSG_SET_FACTION_VISIBLE",
    "SMSG_SET_FORCED_REACTIONS",
    "CMSG_SET_FACTION_ATWAR",
    "CMSG_SET_FACTION_INACTIVE",
    "CMSG_SET_WATCHED_FACTION",
  ],
  uses: [],
  stubs: [["SMSG_INITIALIZE_FACTIONS", "Factions"]],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
