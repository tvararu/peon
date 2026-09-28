import type { AreaOpcodes } from "#wow/areas/contract";

export const EMOTES_OPCODES = {
  owns: ["SMSG_EMOTE", "SMSG_TEXT_EMOTE", "CMSG_EMOTE", "CMSG_TEXT_EMOTE"],
  uses: [],
  stubs: [
    ["SMSG_TEXT_EMOTE", "Text emote"],
    ["SMSG_EMOTE", "Emote animation"],
  ],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
