import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  instancesDifficultyBody,
  instancesInstanceDifficultyBody,
  instancesLastInstanceBody,
  instancesOwnershipBody,
  instancesRaidGroupOnlyBody,
  instancesRaidInstanceMessageBody,
} from "#test-support/areas/instances";
import { areaStubs } from "#wow/areas/compose";
import { INSTANCES_OPCODES } from "#wow/areas/instances/opcodes";
import type { InstancesEvent } from "#wow/areas/instances/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const DEADMINES = { mapId: 36, x: -16, y: -383, z: 62, orientation: 0 };

function rigWithEvents(now = () => 500) {
  const rig = areaRig("instances", { now });
  const seen: InstancesEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen };
}

describe("instances store", () => {
  test("starts with nothing known", () => {
    const { rig } = rigWithEvents();
    try {
      expect(rig.handle.state()).toEqual({
        dungeonDifficulty: undefined,
        raidDifficulty: undefined,
        mapDifficulty: undefined,
        hasPermanentBinds: undefined,
        lastInstanceMaps: [],
        lastWarning: undefined,
        homebindTimer: undefined,
      });
    } finally {
      rig.dispose();
    }
  });

  test("a dungeon difficulty body sets the difficulty once and a repeat emits nothing", () => {
    const { rig, seen } = rigWithEvents();
    try {
      const body = instancesDifficultyBody({ difficulty: 0, inGroup: false });
      rig.inject(GameOpcode.MSG_SET_DUNGEON_DIFFICULTY, body);
      rig.inject(GameOpcode.MSG_SET_DUNGEON_DIFFICULTY, body);
      rig.inject(
        GameOpcode.MSG_SET_DUNGEON_DIFFICULTY,
        instancesDifficultyBody({ difficulty: 1, inGroup: true }),
      );
      expect(rig.handle.state().dungeonDifficulty).toBe(1);
      expect(seen).toEqual([
        {
          type: "difficulty",
          kind: "dungeon",
          difficulty: 0,
          inGroup: false,
          previous: undefined,
          name: "normal",
        },
        {
          type: "difficulty",
          kind: "dungeon",
          difficulty: 1,
          inGroup: true,
          previous: 0,
          name: "heroic",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a raid difficulty body sets the raid difficulty with its name", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.MSG_SET_RAID_DIFFICULTY,
        instancesDifficultyBody({ difficulty: 3, inGroup: true }),
      );
      expect(rig.handle.state()).toMatchObject({
        dungeonDifficulty: undefined,
        raidDifficulty: 3,
      });
      expect(seen).toEqual([
        {
          type: "difficulty",
          kind: "raid",
          difficulty: 3,
          inGroup: true,
          previous: undefined,
          name: "25-heroic",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("an instance difficulty body sets the map difficulty on the current map", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.stores.self.receive({ type: "new_world", position: DEADMINES });
      rig.inject(
        GameOpcode.SMSG_INSTANCE_DIFFICULTY,
        instancesInstanceDifficultyBody({
          difficulty: 1,
          dynamicHeroic: false,
        }),
      );
      const expected = {
        mapId: 36,
        difficulty: 1,
        dynamicHeroic: false,
        name: "heroic",
      };
      expect(rig.handle.state().mapDifficulty).toEqual(expected);
      expect(seen).toEqual([{ type: "map_difficulty", ...expected }]);
    } finally {
      rig.dispose();
    }
  });

  test("ownership then last-instance bodies set the saved maps, and a new ownership body starts over", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_INSTANCE_OWNERSHIP,
        instancesOwnershipBody(true),
      );
      rig.inject(
        GameOpcode.SMSG_UPDATE_LAST_INSTANCE,
        instancesLastInstanceBody(533),
      );
      rig.inject(
        GameOpcode.SMSG_UPDATE_LAST_INSTANCE,
        instancesLastInstanceBody(615),
      );
      expect(rig.handle.state()).toMatchObject({
        hasPermanentBinds: true,
        lastInstanceMaps: [533, 615],
      });
      expect(seen.at(-1)).toEqual({
        type: "saved_maps",
        hasPermanentBinds: true,
        maps: [533, 615],
      });
      rig.inject(
        GameOpcode.SMSG_UPDATE_INSTANCE_OWNERSHIP,
        instancesOwnershipBody(false),
      );
      expect(rig.handle.state()).toMatchObject({
        hasPermanentBinds: false,
        lastInstanceMaps: [],
      });
      expect(seen.map((event) => event.type)).toEqual([
        "saved_maps",
        "saved_maps",
        "saved_maps",
        "saved_maps",
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a raid instance message sets the last warning and emits warning", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_RAID_INSTANCE_MESSAGE,
        instancesRaidInstanceMessageBody({
          kind: 2,
          mapId: 533,
          difficulty: 1,
          secondsLeft: 600,
        }),
      );
      const warning = {
        kind: 2,
        mapId: 533,
        difficulty: 1,
        secondsLeft: 600,
        locked: undefined,
        extended: undefined,
      };
      expect(rig.handle.state().lastWarning).toEqual({ ...warning, at: 500 });
      expect(seen).toEqual([{ type: "warning", ...warning }]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_RAID_GROUP_ONLY starts the homebind timer on the rig clock and (0, 0) cancels it", () => {
    let t = 1000;
    const { rig, seen } = rigWithEvents(() => t);
    try {
      rig.inject(
        GameOpcode.SMSG_RAID_GROUP_ONLY,
        instancesRaidGroupOnlyBody({ timerMs: 60_000, code: 1 }),
      );
      expect(rig.handle.state().homebindTimer).toEqual({
        startedAt: 1000,
        ms: 60_000,
      });
      t = 5000;
      rig.inject(
        GameOpcode.SMSG_RAID_GROUP_ONLY,
        instancesRaidGroupOnlyBody({ timerMs: 0, code: 0 }),
      );
      expect(rig.handle.state().homebindTimer).toBeUndefined();
      expect(seen).toEqual([
        { type: "homebind_timer", state: "started", ms: 60_000, code: 1 },
        { type: "homebind_timer", state: "cancelled", ms: 0, code: 0 },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_CORPSE_NOT_IN_INSTANCE with an empty body emits corpse_elsewhere", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(GameOpcode.SMSG_CORPSE_NOT_IN_INSTANCE, new Uint8Array());
      expect(seen).toEqual([{ type: "corpse_elsewhere" }]);
    } finally {
      rig.dispose();
    }
  });

  test("mapChanged clears the map difficulty and the homebind timer but keeps the difficulties", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.MSG_SET_DUNGEON_DIFFICULTY,
        instancesDifficultyBody({ difficulty: 1, inGroup: false }),
      );
      rig.inject(
        GameOpcode.SMSG_INSTANCE_DIFFICULTY,
        instancesInstanceDifficultyBody({
          difficulty: 1,
          dynamicHeroic: false,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_RAID_GROUP_ONLY,
        instancesRaidGroupOnlyBody({ timerMs: 60_000, code: 1 }),
      );
      rig.stores.areas.instances.mapChanged();
      expect(rig.handle.state()).toMatchObject({
        dungeonDifficulty: 1,
        mapDifficulty: undefined,
        homebindTimer: undefined,
      });
    } finally {
      rig.dispose();
    }
  });

  test("the two stubs are gone and the rig dispatch owns all eight opcodes", () => {
    const { rig } = rigWithEvents();
    try {
      const stubbed = new Set(areaStubs().map(([opcode]) => opcode));
      expect(stubbed.has(GameOpcode.SMSG_INSTANCE_DIFFICULTY)).toBe(false);
      expect(stubbed.has(GameOpcode.SMSG_RAID_INSTANCE_MESSAGE)).toBe(false);
      expect(INSTANCES_OPCODES.stubs).toEqual([]);
      const eight = [
        "MSG_SET_DUNGEON_DIFFICULTY",
        "MSG_SET_RAID_DIFFICULTY",
        "SMSG_INSTANCE_DIFFICULTY",
        "SMSG_UPDATE_INSTANCE_OWNERSHIP",
        "SMSG_UPDATE_LAST_INSTANCE",
        "SMSG_RAID_INSTANCE_MESSAGE",
        "SMSG_RAID_GROUP_ONLY",
        "SMSG_CORPSE_NOT_IN_INSTANCE",
      ] as const;
      expect(
        eight.filter((name) => !rig.dispatch.has(GameOpcode[name])),
      ).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
