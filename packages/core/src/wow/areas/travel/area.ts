import { defineArea } from "#wow/areas/contract";
import { TRAVEL_OPCODES } from "#wow/areas/travel/opcodes";
import {
  parseBinderConfirm,
  parseBindPointUpdate,
  parsePlayerBound,
} from "#wow/areas/travel/protocol";
import { travelRuntime } from "#wow/areas/travel/runtime";
import { createTravelStore } from "#wow/areas/travel/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const travelArea = defineArea({
  name: "travel",
  opcodes: TRAVEL_OPCODES,
  eventTypes: ["bind_point", "bind_offer", "bound"],
  store: (deps) => createTravelStore(deps.now),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_BINDPOINTUPDATE, (r) =>
      store.receiveBindPoint(parseBindPointUpdate(r)),
    );
    wire.on(GameOpcode.SMSG_BINDER_CONFIRM, (r) =>
      store.receiveBinderConfirm(parseBinderConfirm(r)),
    );
    wire.on(GameOpcode.SMSG_PLAYERBOUND, (r) =>
      store.receivePlayerBound(parsePlayerBound(r)),
    );
  },
  runtime: travelRuntime,
});
