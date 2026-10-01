import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { selfstateInebriationBody } from "#test-support/areas/selfstate";
import { PLAYER_FLAG_RESTING } from "#wow/areas/selfstate/fields";
import type { RestStateName } from "#wow/areas/selfstate/protocol";
import type { SelfstateEvent } from "#wow/areas/selfstate/store";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";

const SELF = 0x0f01n;
const OTHER = 0x0f02n;
const FLOWER = 2594;

type Condition = {
  drunk?: number;
  restedXp?: number;
  restByte?: number;
  flags?: number;
};

function player(
  { drunk = 0, restedXp = 0, restByte = 0, flags = 0 }: Condition,
  createComplete = true,
): Entity {
  return {
    createComplete,
    entry: 0,
    guid: SELF,
    name: undefined,
    objectType: ObjectType.PLAYER,
    position: undefined,
    rawFields: new Map([
      [PLAYER_FIELDS.BYTES_3.offset, drunk << 8],
      [PLAYER_FIELDS.BYTES_2.offset, restByte << 24],
      [PLAYER_FIELDS.REST_STATE_EXPERIENCE.offset, restedXp],
      [PLAYER_FIELDS.FLAGS.offset, flags],
    ]),
    scale: 1,
  };
}

function rigCondition(start: Condition) {
  const held = { current: player(start) as Entity | undefined };
  const rig = areaRig("selfstate", {
    getEntity: (guid) => (guid === SELF ? held.current : undefined),
    selfGuid: SELF,
  });
  const events: SelfstateEvent[] = [];
  rig.handle.onEvent((event) => events.push(event));
  const update = (next: Condition) => {
    const entity = player(next);
    held.current = entity;
    rig.events.entity.emit({ changed: ["rawFields"], entity, type: "update" });
  };
  rig.events.entity.emit({ entity: player(start), type: "appear" });
  const drunkEvents = () => events.filter((e) => e.type === "drunk_changed");
  const cross = (guid: bigint, threshold: number) =>
    rig.inject(
      GameOpcode.SMSG_CROSSED_INEBRIATION_THRESHOLD,
      selfstateInebriationBody({ guid, itemId: FLOWER, threshold }),
    );
  return { cross, drunkEvents, events, rig, update };
}

describe("selfstate condition: drunkenness", () => {
  test("a self packet sets drunkState and emits drunk_changed; another guid changes nothing (AC Entities/Player/Player.cpp:1043-1055)", () => {
    const { rig, cross, drunkEvents } = rigCondition({});
    try {
      cross(OTHER, 1);
      expect(drunkEvents()).toEqual([]);
      expect(rig.handle.state().condition.drunkState).toBe("sober");
      cross(SELF, 1);
      expect(rig.handle.state().condition.drunkState).toBe("tipsy");
      cross(SELF, 3);
      expect(drunkEvents()).toEqual([
        { from: "sober", item: FLOWER, to: "tipsy", type: "drunk_changed" },
        { from: "tipsy", item: FLOWER, to: "smashed", type: "drunk_changed" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a packet that repeats the stored state, or names no state, emits nothing", () => {
    const { rig, cross, drunkEvents } = rigCondition({});
    try {
      cross(SELF, 2);
      cross(SELF, 2);
      cross(SELF, 9);
      expect(drunkEvents()).toHaveLength(1);
      expect(rig.handle.state().condition.drunkState).toBe("drunk");
    } finally {
      rig.dispose();
    }
  });

  test("the first self create derives drunkState from the value silently (AC Entities/Player/Player.cpp:1022-1028)", () => {
    for (const [drunk, state] of [
      [0, "sober"],
      [1, "tipsy"],
      [49, "tipsy"],
      [50, "drunk"],
      [89, "drunk"],
      [90, "smashed"],
    ] as const) {
      const { rig, drunkEvents } = rigCondition({ drunk });
      try {
        expect(rig.handle.state().condition).toMatchObject({
          drunkState: state,
          drunkValue: drunk,
        });
        expect(drunkEvents()).toEqual([]);
      } finally {
        rig.dispose();
      }
    }
  });

  test("a later field change moves drunkValue only; the packet owns drunkState", () => {
    const { rig, cross, drunkEvents, update } = rigCondition({ drunk: 10 });
    try {
      update({ drunk: 60 });
      expect(rig.handle.state().condition).toMatchObject({
        drunkState: "tipsy",
        drunkValue: 60,
      });
      cross(SELF, 2);
      update({ drunk: 59 });
      expect(rig.handle.state().condition).toMatchObject({
        drunkState: "drunk",
        drunkValue: 59,
      });
      expect(drunkEvents()).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("an update without the field keeps the last known value", () => {
    const { rig, update } = rigCondition({ drunk: 30 });
    try {
      const partial = { ...player({}, false), rawFields: new Map() };
      rig.events.entity.emit({
        changed: ["rawFields"],
        entity: partial,
        type: "update",
      });
      expect(rig.handle.state().condition.drunkValue).toBe(30);
      update({ drunk: 0 });
      expect(rig.handle.state().condition.drunkValue).toBe(0);
    } finally {
      rig.dispose();
    }
  });
});

describe("selfstate condition: rested state", () => {
  test("restedXp, resting and restState follow the fields (AC Entities/Player/Player.cpp:10396-10408, Player.h:464,978-983)", () => {
    const { rig, update } = rigCondition({});
    try {
      expect(rig.handle.state().condition).toMatchObject({
        restState: "unknown",
        restedXp: 0,
        resting: false,
      });
      update({ flags: PLAYER_FLAG_RESTING, restByte: 2 });
      expect(rig.handle.state().condition).toMatchObject({
        restState: "normal",
        restedXp: 0,
        resting: true,
      });
      update({
        flags: PLAYER_FLAG_RESTING | 0x10,
        restByte: 1,
        restedXp: 1234,
      });
      expect(rig.handle.state().condition).toMatchObject({
        restState: "rested",
        restedXp: 1234,
        resting: true,
      });
      update({ restByte: 5, restedXp: 0 });
      expect(rig.handle.state().condition).toMatchObject({
        restState: "exhausted",
        resting: false,
      });
    } finally {
      rig.dispose();
    }
  });

  test("every rest state byte has a name; an unknown byte is unknown", () => {
    const names: RestStateName[] = [
      "unknown",
      "rested",
      "normal",
      "tired",
      "tired_reduced",
      "exhausted",
      "recruit_linked",
      "unknown",
    ];
    const { rig, update } = rigCondition({});
    try {
      names.forEach((name, restByte) => {
        update({ restByte });
        expect(rig.handle.state().condition.restState).toBe(name);
      });
    } finally {
      rig.dispose();
    }
  });
});
