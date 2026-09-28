import { defineArea } from "#wow/areas/contract";
import { OBJECTS_OPCODES } from "#wow/areas/objects/opcodes";
import { parseAreaTriggerMessage } from "#wow/areas/objects/protocol";
import { objectsRuntime } from "#wow/areas/objects/runtime";
import { ObjectsStore } from "#wow/areas/objects/store";
import { parseGameObjectQueryResponse } from "#wow/protocol/entity-queries";
import { GameOpcode } from "#wow/protocol/opcodes";

export const objectsArea = defineArea({
  name: "objects",
  opcodes: OBJECTS_OPCODES,
  eventTypes: ["trigger_sent", "trigger_message"],
  store: (deps, core) => new ObjectsStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_AREA_TRIGGER_MESSAGE, (r) =>
      store.message(parseAreaTriggerMessage(r)),
    );
    wire.peek(GameOpcode.SMSG_GAMEOBJECT_QUERY_RESPONSE, (r) =>
      store.template(parseGameObjectQueryResponse(r)),
    );
  },
  runtime: objectsRuntime,
});
