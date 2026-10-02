import { BATTLEGROUNDS_OPCODES } from "#wow/areas/battlegrounds/opcodes";
import {
  parseInspectHonorStats,
  parsePvpCredit,
  parseQuestUpdateAddPvpKill,
  parseZoneUnderAttack,
} from "#wow/areas/battlegrounds/protocol";
import {
  parseBattlefieldList,
  parseBattlefieldStatus,
  parseGroupJoinedBattleground,
} from "#wow/areas/battlegrounds/protocol-queue";
import { battlegroundsSelfRuntime } from "#wow/areas/battlegrounds/runtime-self";
import { BattlegroundsStore } from "#wow/areas/battlegrounds/store";
import { defineArea } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";

export const battlegroundsArea = defineArea({
  eventTypes: [
    "pvp_flag",
    "honor_credit",
    "honor_inspect",
    "zone_under_attack",
    "pvp_kill_quest",
    "bg_status",
    "bg_invited",
    "bg_left",
    "bg_list",
    "bg_join_result",
  ],
  name: "battlegrounds",
  opcodes: BATTLEGROUNDS_OPCODES,
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_PVP_CREDIT, (reader) =>
      store.receivePvpCredit(parsePvpCredit(reader)),
    );
    wire.on(GameOpcode.MSG_INSPECT_HONOR_STATS, (reader) =>
      store.receiveInspectHonor(parseInspectHonorStats(reader)),
    );
    wire.on(GameOpcode.SMSG_ZONE_UNDER_ATTACK, (reader) =>
      store.receiveZoneUnderAttack(parseZoneUnderAttack(reader).areaId, false),
    );
    wire.on(GameOpcode.SMSG_QUESTUPDATE_ADD_PVP_KILL, (reader) =>
      store.receivePvpKillQuest(parseQuestUpdateAddPvpKill(reader)),
    );
    wire.on(GameOpcode.SMSG_BATTLEFIELD_STATUS, (reader) =>
      store.receiveBattlefieldStatus(parseBattlefieldStatus(reader)),
    );
    wire.on(GameOpcode.SMSG_BATTLEFIELD_LIST, (reader) =>
      store.receiveBattlefieldList(parseBattlefieldList(reader)),
    );
    wire.on(GameOpcode.SMSG_GROUP_JOINED_BATTLEGROUND, (reader) => {
      const joined = parseGroupJoinedBattleground(reader);
      store.receiveGroupJoined(joined.result, joined.guid);
    });
  },
  runtime: battlegroundsSelfRuntime,
  store: (deps, core) => new BattlegroundsStore(deps, core),
});
