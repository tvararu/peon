import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { instancesEncounterUnitBody } from "#test-support/areas/instances";
import type { InstancesEvent } from "#wow/areas/instances/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const DEADMINES = { mapId: 36, x: -16, y: -383, z: 62, orientation: 0 };

function rigWithEvents(now = () => 500) {
  const rig = areaRig("instances", { now });
  const seen: InstancesEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen };
}

describe("instances store: encounter frames", () => {
  test("engage adds, update keeps, disengage drops, each emitting encounter", () => {
    const { rig, seen } = rigWithEvents();
    const first = 0x00f1_2299_0000_0003n;
    const second = 0x00f1_2299_0000_0004n;
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_INSTANCE_ENCOUNTER_UNIT,
        instancesEncounterUnitBody({ frame: 0, guid: first, priority: 7 }),
      );
      rig.inject(
        GameOpcode.SMSG_UPDATE_INSTANCE_ENCOUNTER_UNIT,
        instancesEncounterUnitBody({ frame: 0, guid: second, priority: 3 }),
      );
      rig.inject(
        GameOpcode.SMSG_UPDATE_INSTANCE_ENCOUNTER_UNIT,
        instancesEncounterUnitBody({ frame: 2, guid: first, priority: 9 }),
      );
      rig.inject(
        GameOpcode.SMSG_UPDATE_INSTANCE_ENCOUNTER_UNIT,
        instancesEncounterUnitBody({ frame: 1, guid: second, priority: 3 }),
      );
      expect(rig.handle.state().encounterUnits).toEqual([{ guid: first }]);
      expect(seen.filter((event) => event.type === "encounter")).toHaveLength(
        4,
      );
    } finally {
      rig.dispose();
    }
  });

  test("re-engaging a tracked unit keeps one row", () => {
    const { rig } = rigWithEvents();
    const guid = 0x00f1_2299_0000_0003n;
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_INSTANCE_ENCOUNTER_UNIT,
        instancesEncounterUnitBody({ frame: 0, guid, priority: 7 }),
      );
      rig.inject(
        GameOpcode.SMSG_UPDATE_INSTANCE_ENCOUNTER_UNIT,
        instancesEncounterUnitBody({ frame: 0, guid, priority: 2 }),
      );
      expect(rig.handle.state().encounterUnits).toEqual([{ guid }]);
    } finally {
      rig.dispose();
    }
  });

  test("a priority update for an untracked unit does not engage it", () => {
    const { rig } = rigWithEvents();
    const guid = 0x00f1_2299_0000_0003n;
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_INSTANCE_ENCOUNTER_UNIT,
        instancesEncounterUnitBody({ frame: 2, guid, priority: 9 }),
      );
      expect(rig.handle.state().encounterUnits).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("non-unit frames keep the units and a map change drops them", () => {
    const { rig, seen } = rigWithEvents();
    const guid = 0x00f1_2299_0000_0003n;
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_INSTANCE_ENCOUNTER_UNIT,
        instancesEncounterUnitBody({ frame: 0, guid, priority: 7 }),
      );
      seen.length = 0;
      rig.inject(
        GameOpcode.SMSG_UPDATE_INSTANCE_ENCOUNTER_UNIT,
        instancesEncounterUnitBody({ frame: 3, param: 2 }),
      );
      rig.inject(
        GameOpcode.SMSG_UPDATE_INSTANCE_ENCOUNTER_UNIT,
        instancesEncounterUnitBody({ frame: 7 }),
      );
      expect(rig.handle.state().encounterUnits).toEqual([{ guid }]);
      expect(seen.filter((event) => event.type === "encounter")).toHaveLength(
        0,
      );
      rig.stores.self.receive({
        type: "new_world",
        position: { ...DEADMINES, mapId: 1 },
      });
      expect(rig.handle.state().encounterUnits).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
