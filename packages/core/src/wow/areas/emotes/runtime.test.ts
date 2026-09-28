import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import type { Entity, EntityEvent, UnitEntity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

const ME = 0xde1n;
const CREATURE = 0xf1_30_00_3d_28_01_48_d2n;
const CHEST = 0xf1_10_00_00_01_00_00_09n;
const DANCE_STATE = 10;
const EMOTE_STATE = UNIT_FIELDS.NPC_EMOTESTATE.offset;

function unit(
  guid: bigint,
  fields: [number, number][],
  objectType: 3 | 4 = ObjectType.UNIT,
): UnitEntity {
  return {
    class_: 1,
    displayId: 1,
    entry: 15_656,
    factionTemplate: 14,
    gender: 0,
    guid,
    health: 100,
    level: 10,
    maxHealth: 100,
    maxPower: [0, 0, 0, 0, 0, 0, 0],
    name: "Angershade",
    npcFlags: 0,
    objectType,
    position: undefined,
    power: [0, 0, 0, 0, 0, 0, 0],
    race: 0,
    rawFields: new Map(fields),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

function chest(fields: [number, number][]): Entity {
  return {
    entry: 1,
    guid: CHEST,
    name: "Chest",
    objectType: ObjectType.GAMEOBJECT,
    position: undefined,
    rawFields: new Map(fields),
    scale: 1,
  };
}

function rig() {
  const r = areaRig("emotes", { selfGuid: ME });
  const states = () => r.handle.state().emoteStates;
  return { r, states };
}

describe("emotes runtime", () => {
  test("appear and update read NPC_EMOTESTATE into the emote states", () => {
    const { r, states } = rig();
    try {
      r.events.entity.emit({
        entity: unit(CREATURE, [[EMOTE_STATE, DANCE_STATE]]),
        type: "appear",
      });
      r.events.entity.emit({
        changed: ["rawFields"],
        entity: unit(ME, [[EMOTE_STATE, DANCE_STATE]], ObjectType.PLAYER),
        type: "update",
      });
      expect(states()).toEqual([
        { guid: CREATURE, state: DANCE_STATE },
        { guid: ME, state: DANCE_STATE },
      ]);
      r.events.entity.emit({
        changed: ["rawFields"],
        entity: unit(ME, [[EMOTE_STATE, 0]], ObjectType.PLAYER),
        type: "update",
      });
      r.events.entity.emit({
        changed: ["health"],
        entity: unit(CREATURE, []),
        type: "update",
      });
      expect(states()).toEqual([]);
    } finally {
      r.dispose();
    }
  });

  test("disappear forgets the unit", () => {
    const { r, states } = rig();
    try {
      r.events.entity.emit({
        entity: unit(CREATURE, [[EMOTE_STATE, DANCE_STATE]]),
        type: "appear",
      });
      r.events.entity.emit({ guid: CREATURE, type: "disappear" });
      expect(states()).toEqual([]);
    } finally {
      r.dispose();
    }
  });

  test("a game object's field at the same offset is not an emote state", () => {
    const { r, states } = rig();
    try {
      r.events.entity.emit({
        entity: chest([[EMOTE_STATE, DANCE_STATE]]),
        type: "appear",
      });
      expect(states()).toEqual([]);
    } finally {
      r.dispose();
    }
  });

  test("an entity event without an entity changes nothing", () => {
    const { r, states } = rig();
    try {
      r.events.entity.emit({ type: "appear" } as EntityEvent);
      expect(states()).toEqual([]);
    } finally {
      r.dispose();
    }
  });
});
