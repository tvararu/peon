import type { AreaOpcodes } from "#wow/areas/contract";

export const CONTACTS_OPCODES = {
  owns: [
    "CMSG_CONTACT_LIST",
    "CMSG_SET_CONTACT_NOTES",
    "CMSG_CHAT_IGNORED",
    "SMSG_CHAT_NOT_IN_PARTY",
    "SMSG_CHAT_PLAYER_AMBIGUOUS",
  ],
  uses: ["SMSG_CONTACT_LIST", "SMSG_MESSAGE_CHAT"],
  stubs: [],
  dead: ["SMSG_CHAT_NOT_IN_PARTY", "SMSG_CHAT_PLAYER_AMBIGUOUS"],
  unseen: [],
} as const satisfies AreaOpcodes;
