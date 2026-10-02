import { defineArea } from "#wow/areas/contract";
import { INSPECT_OPCODES } from "#wow/areas/inspect/opcodes";
import {
  parseInspectTalent,
  parseRespondInspectAchievements,
} from "#wow/areas/inspect/protocol";
import { inspectRuntime } from "#wow/areas/inspect/runtime";
import { InspectStore } from "#wow/areas/inspect/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const inspectArea = defineArea({
  eventTypes: ["talents", "achievements"],
  name: "inspect",
  opcodes: INSPECT_OPCODES,
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_INSPECT_TALENT, (r) =>
      store.receiveTalents(parseInspectTalent(r)),
    );
    wire.on(GameOpcode.SMSG_RESPOND_INSPECT_ACHIEVEMENTS, (r) =>
      store.receiveAchievements(parseRespondInspectAchievements(r)),
    );
  },
  runtime: inspectRuntime,
  store: () => new InspectStore(),
});
