import { defineArea } from "#wow/areas/contract";
import { QUESTS_OPCODES } from "#wow/areas/quests/opcodes";
import {
  parseQuestgiverStatusMultiple,
  parseQuestPoiResponse,
} from "#wow/areas/quests/protocol";
import { questsRuntime } from "#wow/areas/quests/runtime";
import { QuestsStore } from "#wow/areas/quests/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { parseQuestgiverStatus } from "#wow/protocol/questgiver";

export const questsArea = defineArea({
  name: "quests",
  opcodes: QUESTS_OPCODES,
  eventTypes: ["marks", "poi"],
  store: (deps, core) => new QuestsStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_QUESTGIVER_STATUS_MULTIPLE, (r) =>
      store.receiveMultiple(parseQuestgiverStatusMultiple(r)),
    );
    wire.peek(GameOpcode.SMSG_QUESTGIVER_STATUS, (r) =>
      store.receiveSingle(parseQuestgiverStatus(r)),
    );
    wire.on(GameOpcode.SMSG_QUEST_POI_QUERY_RESPONSE, (r) =>
      store.receivePoiResponse(parseQuestPoiResponse(r)),
    );
  },
  runtime: questsRuntime,
});
