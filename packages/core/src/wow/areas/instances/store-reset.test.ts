import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  instancesDifficultyBody,
  instancesResetBody,
  instancesResetFailedBody,
  instancesResetFailedNotifyBody,
} from "#test-support/areas/instances";
import type { InstancesEvent } from "#wow/areas/instances/store";
import { GameOpcode } from "#wow/protocol/opcodes";

function rigWithEvents() {
  const rig = areaRig("instances");
  const seen: InstancesEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen };
}

describe("instances store: resets", () => {
  test("SMSG_INSTANCE_RESET emits reset with the map", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(GameOpcode.SMSG_INSTANCE_RESET, instancesResetBody(36));
      expect(seen).toEqual([{ type: "reset", mapId: 36 }]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_INSTANCE_RESET_FAILED emits reset_failed with the reason and map", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_INSTANCE_RESET_FAILED,
        instancesResetFailedBody({ reason: 0, mapId: 36 }),
      );
      expect(seen).toEqual([{ type: "reset_failed", mapId: 36, reason: 0 }]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_RESET_FAILED_NOTIFY emits reset_blocked with the map", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_RESET_FAILED_NOTIFY,
        instancesResetFailedNotifyBody(36),
      );
      expect(seen).toEqual([{ type: "reset_blocked", mapId: 36 }]);
    } finally {
      rig.dispose();
    }
  });
});

describe("instances store: pending difficulty", () => {
  test("a difficulty body of any value clears the pending change, even an unchanged one", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.MSG_SET_DUNGEON_DIFFICULTY,
        instancesDifficultyBody({ difficulty: 0, inGroup: false }),
      );
      rig.stores.areas.instances.pendDifficulty("dungeon", 1);
      expect(rig.handle.state().pendingDifficulty).toEqual({ dungeon: 1 });
      rig.inject(
        GameOpcode.MSG_SET_RAID_DIFFICULTY,
        instancesDifficultyBody({ difficulty: 0, inGroup: false }),
      );
      expect(rig.handle.state().pendingDifficulty).toBeDefined();
      rig.inject(
        GameOpcode.MSG_SET_DUNGEON_DIFFICULTY,
        instancesDifficultyBody({ difficulty: 0, inGroup: false }),
      );
      expect(rig.handle.state().pendingDifficulty).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });
});
