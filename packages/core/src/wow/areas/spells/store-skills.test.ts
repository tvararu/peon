import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { spellsSkillFields } from "#test-support/areas/spells";
import type { SpellsEvent } from "#wow/areas/spells/store";
import type { UnitEntity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";

const ME = 0x2an;
const MINING = 186;

function player(rawFields: ReadonlyMap<number, number>): UnitEntity {
  return {
    class_: 8,
    displayId: 1,
    entry: 0,
    factionTemplate: 1,
    gender: 0,
    guid: ME,
    health: 200,
    level: 10,
    maxHealth: 200,
    maxPower: [0, 0, 0, 0, 0, 0, 0],
    name: "Mage",
    npcFlags: 0,
    objectType: ObjectType.PLAYER,
    position: undefined,
    power: [0, 0, 0, 0, 0, 0, 0],
    race: 10,
    rawFields,
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}
function fields() {
  return spellsSkillFields([
    { id: MINING, max: 75, perm: 0, step: 1, temp: 0, value: 12 },
  ]);
}

function setup() {
  let raw: ReadonlyMap<number, number> = new Map();
  const rig = areaRig("spells", {
    getEntity: (guid) => (guid === ME ? player(raw) : undefined),
    selfGuid: ME,
  });
  const seen: SpellsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  const update = (next: ReadonlyMap<number, number>) => {
    raw = next;
    rig.events.entity.emit({
      changed: ["rawFields"],
      entity: player(next),
      type: "update",
    });
  };
  const appear = (next: ReadonlyMap<number, number>) => {
    raw = next;
    rig.events.entity.emit({
      entity: player(next),
      type: "appear",
    });
  };
  return { appear, rig, seen, update };
}
describe("spells skill baseline", () => {
  test("skills are empty until the self update arrives", () => {
    const { rig } = setup();
    try {
      expect(rig.handle.state().skills).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a value change emits skill_changed and a vanished id emits skill_removed", () => {
    const { rig, seen, update } = setup();
    try {
      update(fields());
      expect(seen).toEqual([]);
      update(
        spellsSkillFields([
          { id: MINING, max: 75, perm: 0, step: 1, temp: 0, value: 13 },
        ]),
      );
      expect(seen).toEqual([
        {
          from: 12,
          id: MINING,
          max: 75,
          name: "Mining",
          to: 13,
          type: "skill_changed",
        },
      ]);
      expect(rig.handle.state().skills.at(0)).toMatchObject({
        id: MINING,
        value: 13,
      });
      update(new Map());
      expect(seen.at(-1)).toEqual({
        id: MINING,
        name: "Mining",
        type: "skill_removed",
      });
      expect(rig.handle.state().skills).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("the self appear seeds the baseline so the next update diffs against it", () => {
    const { appear, rig, seen, update } = setup();
    try {
      appear(fields());
      expect(seen).toEqual([]);
      update(
        spellsSkillFields([
          { id: MINING, max: 75, perm: 0, step: 1, temp: 0, value: 13 },
        ]),
      );
      expect(seen).toEqual([
        {
          from: 12,
          id: MINING,
          max: 75,
          name: "Mining",
          to: 13,
          type: "skill_changed",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("an other unit's update and the same value repeated emit nothing", () => {
    const { rig, seen, update } = setup();
    try {
      rig.events.entity.emit({
        changed: ["rawFields"],
        entity: { ...player(fields()), guid: 0x2bn },
        type: "update",
      });
      update(fields());
      update(fields());
      expect(seen).toEqual([]);
      expect(rig.handle.state().skills).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });
});
