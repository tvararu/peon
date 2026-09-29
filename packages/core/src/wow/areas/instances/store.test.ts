import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  instancesDifficultyBody,
  instancesInstanceDifficultyBody,
  instancesLastInstanceBody,
  instancesLockWarningBody,
  instancesOwnershipBody,
  instancesRaidGroupOnlyBody,
  instancesRaidInstanceInfoBody,
  instancesRaidInstanceMessageBody,
  instancesSaveCreatedBody,
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

const ICC = {
  mapId: 631,
  difficulty: 3,
  instanceGuid: 0x1f50_0000_0000_0007n,
  extended: false,
  secondsToReset: 86_400,
};
const NAXX = {
  mapId: 533,
  difficulty: 1,
  instanceGuid: 0x1f50_0000_0000_0009n,
  extended: true,
  secondsToReset: 3600,
};
const lockOf = (init: typeof ICC) => ({
  mapId: init.mapId,
  difficulty: init.difficulty,
  instanceGuid: init.instanceGuid,
  locked: true,
  extended: init.extended,
  secondsToReset: init.secondsToReset,
});

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
        locks: undefined,
        locksAt: undefined,
        pendingBind: undefined,
        pendingDifficulty: undefined,
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

  test("a raid info reply sets the locks with its arrival time and emits the maps added and removed", () => {
    let clock = 500;
    const { rig, seen } = rigWithEvents(() => clock);
    try {
      rig.inject(
        GameOpcode.SMSG_RAID_INSTANCE_INFO,
        instancesRaidInstanceInfoBody([ICC, NAXX]),
      );
      expect(rig.handle.state()).toMatchObject({
        locks: [lockOf(ICC), lockOf(NAXX)],
        locksAt: 500,
      });
      clock = 900;
      rig.inject(
        GameOpcode.SMSG_RAID_INSTANCE_INFO,
        instancesRaidInstanceInfoBody([
          NAXX,
          { ...ICC, mapId: 603, difficulty: 0 },
        ]),
      );
      expect(rig.handle.state().locksAt).toBe(900);
      expect(seen).toEqual([
        {
          type: "lockouts",
          locks: [lockOf(ICC), lockOf(NAXX)],
          added: [lockOf(ICC), lockOf(NAXX)],
          removed: [],
        },
        {
          type: "lockouts",
          locks: [lockOf(NAXX), lockOf({ ...ICC, mapId: 603, difficulty: 0 })],
          added: [lockOf({ ...ICC, mapId: 603, difficulty: 0 })],
          removed: [lockOf(ICC)],
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("an empty raid info reply is known: locks is an empty list, not undefined, and an extension change adds and removes nothing", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_RAID_INSTANCE_INFO,
        instancesRaidInstanceInfoBody([]),
      );
      expect(rig.handle.state().locks).toEqual([]);
      rig.inject(
        GameOpcode.SMSG_RAID_INSTANCE_INFO,
        instancesRaidInstanceInfoBody([ICC]),
      );
      rig.inject(
        GameOpcode.SMSG_RAID_INSTANCE_INFO,
        instancesRaidInstanceInfoBody([{ ...ICC, extended: true }]),
      );
      expect(seen[2]).toMatchObject({
        type: "lockouts",
        added: [],
        removed: [],
      });
      expect(rig.handle.state().locks?.[0]?.extended).toBe(true);
    } finally {
      rig.dispose();
    }
  });

  test("a lock warning sets pendingBind with its deadline and emits bind_offer", () => {
    const { rig, seen } = rigWithEvents(() => 1000);
    try {
      rig.inject(
        GameOpcode.SMSG_INSTANCE_LOCK_WARNING_QUERY,
        instancesLockWarningBody({ timeoutMs: 60_000, encounterMask: 3 }),
      );
      expect(rig.handle.state().pendingBind).toEqual({
        timeoutMs: 60_000,
        encounterMask: 3,
        at: 1000,
        deadline: 61_000,
      });
      expect(seen).toEqual([
        {
          type: "bind_offer",
          timeoutMs: 60_000,
          encounterMask: 3,
          deadline: 61_000,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_INSTANCE_SAVE_CREATED clears the pending bind and emits bound", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_INSTANCE_LOCK_WARNING_QUERY,
        instancesLockWarningBody({ timeoutMs: 60_000, encounterMask: 0 }),
      );
      rig.inject(
        GameOpcode.SMSG_INSTANCE_SAVE_CREATED,
        instancesSaveCreatedBody(),
      );
      expect(rig.handle.state().pendingBind).toBeUndefined();
      expect(seen.map((e) => e.type)).toEqual(["bind_offer", "bound"]);
    } finally {
      rig.dispose();
    }
  });

  test("a pending bind reads as absent from its deadline on", () => {
    let clock = 0;
    const { rig } = rigWithEvents(() => clock);
    try {
      rig.inject(
        GameOpcode.SMSG_INSTANCE_LOCK_WARNING_QUERY,
        instancesLockWarningBody({ timeoutMs: 60_000, encounterMask: 0 }),
      );
      clock = 59_999;
      expect(rig.handle.state().pendingBind).toBeDefined();
      clock = 60_000;
      expect(rig.handle.state().pendingBind).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("mapChanged clears the pending bind and keeps the locks", () => {
    const { rig } = rigWithEvents();
    try {
      rig.stores.self.receive({ type: "login_verified", position: DEADMINES });
      rig.inject(
        GameOpcode.SMSG_RAID_INSTANCE_INFO,
        instancesRaidInstanceInfoBody([ICC]),
      );
      rig.inject(
        GameOpcode.SMSG_INSTANCE_LOCK_WARNING_QUERY,
        instancesLockWarningBody({ timeoutMs: 60_000, encounterMask: 0 }),
      );
      rig.stores.self.receive({
        type: "new_world",
        position: { ...DEADMINES, mapId: 1 },
      });
      expect(rig.handle.state().pendingBind).toBeUndefined();
      expect(rig.handle.state().locks).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });
});
