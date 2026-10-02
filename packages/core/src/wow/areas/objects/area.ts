import { defineArea } from "#wow/areas/contract";
import { OBJECTS_OPCODES } from "#wow/areas/objects/opcodes";
import {
  parseAreaTriggerMessage,
  parseCastFailed,
  parseCustomAnim,
  parseDespawnAnim,
  parseGameObjectPageText,
  parsePageText,
  parseSpellStart,
} from "#wow/areas/objects/protocol";
import { objectsRuntime } from "#wow/areas/objects/runtime";
import { ObjectsStore } from "#wow/areas/objects/store";
import { parseGameObjectQueryResponse } from "#wow/protocol/entity-queries";
import { GameOpcode } from "#wow/protocol/opcodes";

export const objectsArea = defineArea({
  name: "objects",
  opcodes: OBJECTS_OPCODES,
  eventTypes: [
    "used",
    "trigger_sent",
    "trigger_message",
    "page_read",
    "page_shown",
    "page_unanswered",
    "fish_hooked",
    "fish_not_hooked",
    "fish_escaped",
  ],
  store: (deps, core) => new ObjectsStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_AREA_TRIGGER_MESSAGE, (r) =>
      store.message(parseAreaTriggerMessage(r)),
    );
    wire.on(GameOpcode.SMSG_PAGE_TEXT_QUERY_RESPONSE, (r) =>
      store.page(parsePageText(r)),
    );
    wire.on(GameOpcode.SMSG_GAMEOBJECT_PAGETEXT, (r) =>
      store.shown(parseGameObjectPageText(r)),
    );
    wire.peek(GameOpcode.SMSG_GAMEOBJECT_QUERY_RESPONSE, (r) =>
      store.template(parseGameObjectQueryResponse(r)),
    );
    wire.on(GameOpcode.SMSG_GAMEOBJECT_CUSTOM_ANIM, (r) =>
      store.customAnim(parseCustomAnim(r)),
    );
    wire.on(GameOpcode.SMSG_GAMEOBJECT_DESPAWN_ANIM, (r) =>
      store.despawnAnim(parseDespawnAnim(r)),
    );
    wire.on(GameOpcode.SMSG_FISH_NOT_HOOKED, () => store.notHooked());
    wire.on(GameOpcode.SMSG_FISH_ESCAPED, () => store.escaped());
    wire.peek(GameOpcode.SMSG_SPELL_START, (r) =>
      store.spellStarted(parseSpellStart(r)),
    );
    wire.peek(GameOpcode.SMSG_CAST_FAILED, (r) =>
      store.spellFailed(parseCastFailed(r)),
    );
  },
  runtime: objectsRuntime,
});
