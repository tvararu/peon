import { ACHIEVEMENTS_OPCODES } from "#wow/areas/achievements/opcodes";
import {
  parseAchievementDeleted,
  parseAchievementEarned,
  parseCriteriaDeleted,
  parseCriteriaUpdate,
  parseServerFirst,
  parseTitleEarned,
} from "#wow/areas/achievements/protocol";
import { achievementsRuntime } from "#wow/areas/achievements/runtime";
import { AchievementStore } from "#wow/areas/achievements/store";
import { defineArea } from "#wow/areas/contract";
import { parseAchievementData } from "#wow/protocol/achievement-data";
import { GameOpcode } from "#wow/protocol/opcodes";

export const achievementsArea = defineArea({
  name: "achievements",
  opcodes: ACHIEVEMENTS_OPCODES,
  eventTypes: [
    "achievement_earned",
    "achievement_removed",
    "criteria_removed",
    "title_changed",
    "server_first",
  ],
  store: (deps, core) => new AchievementStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_ALL_ACHIEVEMENT_DATA, (r) =>
      store.replace(parseAchievementData(r)),
    );
    wire.on(GameOpcode.SMSG_CRITERIA_UPDATE, (r) =>
      store.setCriteria(parseCriteriaUpdate(r)),
    );
    wire.on(GameOpcode.SMSG_ACHIEVEMENT_EARNED, (r) =>
      store.earned(parseAchievementEarned(r)),
    );
    wire.on(GameOpcode.SMSG_SERVER_FIRST_ACHIEVEMENT, (r) =>
      store.serverFirst(parseServerFirst(r)),
    );
    wire.on(GameOpcode.SMSG_CRITERIA_DELETED, (r) =>
      store.removeCriteria(parseCriteriaDeleted(r)),
    );
    wire.on(GameOpcode.SMSG_ACHIEVEMENT_DELETED, (r) =>
      store.removeAchievement(parseAchievementDeleted(r)),
    );
    wire.on(GameOpcode.SMSG_TITLE_EARNED, (r) =>
      store.titleEarned(parseTitleEarned(r)),
    );
  },
  runtime: achievementsRuntime,
});
