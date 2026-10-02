import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import type { QuestsEvent } from "#wow/areas/quests/store";
import type { EntityEvent, UnitEntity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";

const ME = 0x2an;
const OTHER = 0x2bn;
const FIRST = 1280;
const LAST = 1304;

function player(
  guid: bigint,
  fields: readonly (readonly [number, number])[],
): UnitEntity {
  return {
    class_: 1,
    displayId: 1,
    entry: 0,
    factionTemplate: 1,
    gender: 0,
    guid,
    health: 100,
    level: 70,
    maxHealth: 100,
    maxPower: [0, 0, 0, 0, 0, 0, 0],
    name: "Self",
    npcFlags: 0,
    objectType: ObjectType.PLAYER,
    position: undefined,
    power: [0, 0, 0, 0, 0, 0, 0],
    race: 1,
    rawFields: new Map(fields),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

function setup() {
  const rig = areaRig("quests", { selfGuid: ME });
  const seen: QuestsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  const entity = (event: EntityEvent) => rig.events.entity.emit(event);
  const daily = () => seen.filter((event) => event.type === "daily");
  return { daily, entity, rig };
}

describe("quests daily", () => {
  test("the self entity's create block sets the daily ids and emits once", () => {
    const { daily, entity, rig } = setup();
    entity({
      entity: player(ME, [
        [FIRST, 14_179],
        [FIRST + 1, 11_545],
        [FIRST + 2, 0],
      ]),
      type: "appear",
    });
    expect(rig.handle.state().daily).toEqual(new Set([14_179, 11_545]));
    expect(daily()).toEqual([{ count: 2, type: "daily" }]);
    rig.dispose();
  });

  test("an update that adds a quest id in a later slot adds to the set", () => {
    const { daily, entity, rig } = setup();
    entity({
      entity: player(ME, [[FIRST, 14_179]]),
      type: "appear",
    });
    entity({
      changed: ["rawFields"],
      entity: player(ME, [
        [FIRST, 14_179],
        [LAST, 11_545],
      ]),
      type: "update",
    });
    expect(rig.handle.state().daily).toEqual(new Set([14_179, 11_545]));
    expect(daily().map((event) => event.count)).toEqual([1, 2]);
    rig.dispose();
  });

  test("an update that leaves the set unchanged emits nothing", () => {
    const { daily, entity, rig } = setup();
    entity({ entity: player(ME, [[FIRST, 14_179]]), type: "appear" });
    entity({
      changed: ["rawFields"],
      entity: player(ME, [[FIRST, 14_179]]),
      type: "update",
    });
    expect(daily()).toHaveLength(1);
    rig.dispose();
  });

  test("the daily reset zeroes every slot and empties the set", () => {
    const { daily, entity, rig } = setup();
    entity({ entity: player(ME, [[FIRST, 14_179]]), type: "appear" });
    entity({
      changed: ["rawFields"],
      entity: player(ME, [[FIRST, 0]]),
      type: "update",
    });
    expect(rig.handle.state().daily).toEqual(new Set());
    expect(daily().map((event) => event.count)).toEqual([1, 0]);
    rig.dispose();
  });

  test("an all-zero first read sets an empty set and emits nothing", () => {
    const { daily, entity, rig } = setup();
    entity({ entity: player(ME, [[FIRST, 0]]), type: "appear" });
    expect(rig.handle.state().daily).toEqual(new Set());
    expect(daily()).toEqual([]);
    rig.dispose();
  });

  test("another player's entity and offsets outside the field are ignored", () => {
    const { daily, entity, rig } = setup();
    entity({ entity: player(OTHER, [[FIRST, 14_179]]), type: "appear" });
    entity({
      entity: player(ME, [
        [FIRST - 1, 99],
        [LAST + 1, 98],
      ]),
      type: "appear",
    });
    expect(rig.handle.state().daily).toEqual(new Set());
    expect(daily()).toEqual([]);
    rig.dispose();
  });

  test("the state has no daily set before the self entity arrives", () => {
    const { rig } = setup();
    expect(rig.handle.state().daily).toBeUndefined();
    rig.dispose();
  });
});
