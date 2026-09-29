import { defineArea } from "#wow/areas/contract";
import { INSTANCES_OPCODES } from "#wow/areas/instances/opcodes";
import {
  parseDifficulty,
  parseInstanceDifficulty,
  parseInstanceOwnership,
  parseInstanceReset,
  parseInstanceResetFailed,
  parseLastInstance,
  parseLockWarning,
  parseRaidGroupOnly,
  parseRaidInstanceInfo,
  parseRaidInstanceMessage,
  parseResetFailedNotify,
} from "#wow/areas/instances/protocol";
import { instancesRuntime } from "#wow/areas/instances/runtime";
import { createInstancesStore } from "#wow/areas/instances/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const instancesArea = defineArea({
  name: "instances",
  opcodes: INSTANCES_OPCODES,
  eventTypes: [
    "difficulty",
    "map_difficulty",
    "saved_maps",
    "warning",
    "homebind_timer",
    "corpse_elsewhere",
    "lockouts",
    "bind_offer",
    "bound",
    "reset",
    "reset_failed",
    "reset_blocked",
  ],
  store: (deps, core) => createInstancesStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.MSG_SET_DUNGEON_DIFFICULTY, (r) =>
      store.difficulty("dungeon", parseDifficulty(r)),
    );
    wire.on(GameOpcode.MSG_SET_RAID_DIFFICULTY, (r) =>
      store.difficulty("raid", parseDifficulty(r)),
    );
    wire.on(GameOpcode.SMSG_INSTANCE_DIFFICULTY, (r) =>
      store.instanceDifficulty(parseInstanceDifficulty(r)),
    );
    wire.on(GameOpcode.SMSG_UPDATE_INSTANCE_OWNERSHIP, (r) =>
      store.ownership(parseInstanceOwnership(r)),
    );
    wire.on(GameOpcode.SMSG_UPDATE_LAST_INSTANCE, (r) =>
      store.lastInstance(parseLastInstance(r)),
    );
    wire.on(GameOpcode.SMSG_RAID_INSTANCE_MESSAGE, (r) =>
      store.warning(parseRaidInstanceMessage(r)),
    );
    wire.on(GameOpcode.SMSG_RAID_GROUP_ONLY, (r) =>
      store.groupOnly(parseRaidGroupOnly(r)),
    );
    wire.on(GameOpcode.SMSG_CORPSE_NOT_IN_INSTANCE, () =>
      store.corpseElsewhere(),
    );
    wire.on(GameOpcode.SMSG_RAID_INSTANCE_INFO, (r) =>
      store.raidInfo(parseRaidInstanceInfo(r)),
    );
    wire.on(GameOpcode.SMSG_INSTANCE_LOCK_WARNING_QUERY, (r) =>
      store.lockWarning(parseLockWarning(r)),
    );
    wire.on(GameOpcode.SMSG_INSTANCE_RESET, (r) =>
      store.reset(parseInstanceReset(r)),
    );
    wire.on(GameOpcode.SMSG_INSTANCE_RESET_FAILED, (r) =>
      store.resetFailed(parseInstanceResetFailed(r)),
    );
    wire.on(GameOpcode.SMSG_RESET_FAILED_NOTIFY, (r) =>
      store.resetBlocked(parseResetFailedNotify(r)),
    );
    wire.on(GameOpcode.SMSG_INSTANCE_SAVE_CREATED, () => store.saveCreated());
  },
  runtime: instancesRuntime,
});
