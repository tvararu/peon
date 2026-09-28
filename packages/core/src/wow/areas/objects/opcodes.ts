import type { AreaOpcodes } from "#wow/areas/contract";

export const OBJECTS_OPCODES = {
  owns: [
    "CMSG_GAMEOBJ_USE",
    "CMSG_GAMEOBJ_REPORT_USE",
    "CMSG_PAGE_TEXT_QUERY",
    "SMSG_PAGE_TEXT_QUERY_RESPONSE",
    "SMSG_GAMEOBJECT_PAGETEXT",
    "CMSG_AREATRIGGER",
    "SMSG_AREA_TRIGGER_MESSAGE",
    "SMSG_GAMEOBJECT_CUSTOM_ANIM",
    "SMSG_GAMEOBJECT_DESPAWN_ANIM",
    "SMSG_FISH_NOT_HOOKED",
    "SMSG_FISH_ESCAPED",
  ],
  uses: [],
  stubs: [["SMSG_AREA_TRIGGER_MESSAGE", "Area trigger message"]],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
