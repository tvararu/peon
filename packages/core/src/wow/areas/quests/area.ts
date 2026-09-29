import { defineArea } from "#wow/areas/contract";
import { QUESTS_OPCODES } from "#wow/areas/quests/opcodes";
import {
  parseGossipPoi,
  parseNpcTextUpdate,
  parseQuestgiverStatusMultiple,
  parseQuestPoiResponse,
  parseQuestPushResult,
  parseQuestsCompleted,
} from "#wow/areas/quests/protocol";
import { questsRuntime } from "#wow/areas/quests/runtime";
import { QuestsStore } from "#wow/areas/quests/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import {
  parseQuestgiverQuestDetails,
  parseQuestgiverRequestItems,
  parseQuestgiverStatus,
} from "#wow/protocol/questgiver";

export const questsArea = defineArea({
  name: "quests",
  opcodes: QUESTS_OPCODES,
  eventTypes: ["marks", "poi", "npc_text", "gossip_poi", "completed", "share"],
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
    wire.on(GameOpcode.SMSG_NPC_TEXT_UPDATE, (r) =>
      store.receiveNpcText(parseNpcTextUpdate(r)),
    );
    wire.on(GameOpcode.SMSG_GOSSIP_POI, (r) =>
      store.receiveGossipPoi(parseGossipPoi(r)),
    );
    wire.on(GameOpcode.SMSG_QUERY_QUESTS_COMPLETED_RESPONSE, (r) =>
      store.receiveCompleted(parseQuestsCompleted(r)),
    );
    wire.on(GameOpcode.MSG_QUEST_PUSH_RESULT, (r) => {
      const { guid, result } = parseQuestPushResult(r);
      store.receivePushResult(guid, result);
    });
    wire.peek(GameOpcode.SMSG_QUESTGIVER_QUEST_DETAILS, (r) =>
      store.receiveShareDetails(parseQuestgiverQuestDetails(r)),
    );
    wire.peek(GameOpcode.SMSG_QUESTGIVER_REQUEST_ITEMS, (r) =>
      store.receiveShareRequestItems(parseQuestgiverRequestItems(r)),
    );
  },
  runtime: questsRuntime,
});
