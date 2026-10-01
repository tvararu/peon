import { defineArea } from "#wow/areas/contract";
import { TRAVEL_OPCODES } from "#wow/areas/travel/opcodes";
import {
  parseActivateTaxiReply,
  parseBinderConfirm,
  parseBindPointUpdate,
  parsePlayerBound,
  parseShowTaxiNodes,
  parseTaxiNodeStatus,
} from "#wow/areas/travel/protocol";
import { travelRuntime } from "#wow/areas/travel/runtime";
import { createTravelStore } from "#wow/areas/travel/store";
import { parseMonsterMove } from "#wow/protocol/monster-move";
import { GameOpcode } from "#wow/protocol/opcodes";

export const travelArea = defineArea({
  name: "travel",
  opcodes: TRAVEL_OPCODES,
  eventTypes: [
    "bind_point",
    "bind_offer",
    "bound",
    "taxi_node_status",
    "taxi_node_learned",
    "taxi_node_named",
    "taxi_map",
    "benchmark",
    "taxi_reply",
    "flight_started",
    "flight_landed",
  ],
  store: (deps) => createTravelStore(deps.now, deps.selfGuid),
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
    wire.on(GameOpcode.SMSG_TAXINODE_STATUS, (r) =>
      store.receiveTaxiNodeStatus(parseTaxiNodeStatus(r)),
    );
    wire.on(GameOpcode.SMSG_NEW_TAXI_PATH, () => store.receiveNewTaxiPath());
    wire.peek(GameOpcode.SMSG_SHOWTAXINODES, (r) =>
      store.receiveShowTaxiNodes(parseShowTaxiNodes(r)),
    );
    wire.on(GameOpcode.SMSG_ACTIVATETAXIREPLY, (r) =>
      store.receiveActivateTaxiReply(parseActivateTaxiReply(r)),
    );
    wire.peek(GameOpcode.SMSG_MONSTER_MOVE, (r) =>
      store.receiveFlightSpline(parseMonsterMove(r)),
    );
  },
  runtime: travelRuntime,
});
