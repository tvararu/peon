import { defineArea } from "#wow/areas/contract";
import { THREAT_OPCODES } from "#wow/areas/threat/opcodes";
import {
  parseThreatClear,
  parseThreatRemove,
  parseThreatUpdate,
} from "#wow/areas/threat/protocol";
import { threatRuntime } from "#wow/areas/threat/runtime";
import { ThreatStore } from "#wow/areas/threat/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const threatArea = defineArea({
  name: "threat",
  opcodes: THREAT_OPCODES,
  eventTypes: ["table", "victim_changed", "removed", "cleared"],
  store: (deps, core) => new ThreatStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_HIGHEST_THREAT_UPDATE, (r) =>
      store.update(parseThreatUpdate(r, { highest: true })),
    );
    wire.on(GameOpcode.SMSG_THREAT_UPDATE, (r) =>
      store.update(parseThreatUpdate(r, { highest: false })),
    );
    wire.on(GameOpcode.SMSG_THREAT_REMOVE, (r) =>
      store.remove(parseThreatRemove(r)),
    );
    wire.on(GameOpcode.SMSG_THREAT_CLEAR, (r) =>
      store.clearTable(parseThreatClear(r)),
    );
    wire.peek(GameOpcode.SMSG_NEW_WORLD, () => store.clear());
  },
  runtime: threatRuntime,
});
